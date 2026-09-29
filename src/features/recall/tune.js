import { log } from "../../core/log.js";
import { serviceRefs, resolveImageCompat, createDraftImagesCompat } from "../../core/services.js";

    // ---------- 调试 API：撤回条实时调参（调试模式 dsh-easyrewrite:debug=1 时挂 window.__dshEasyRewrite.bar） ----------
    // 用法：__dshEasyRewrite.bar.get() 看现状（含计算样式）；.set({inset,size,radius,bg}) 实时调（立即生效，不落盘）；
    // .diagnose() 扫全样式表找压圆角的规则；.export() 导出 JSON（发给我固化进代码）。纯内存，刷新即还原。
    var barTune = { inset: null, size: null, radius: null, bg: null };
    function barApplyCircTune(xCirc) {
      // 圆钮调参重放：bar 因官方重渲染被重建时，placeBar 调用此函数恢复 size（inset 由 placeBar 自身处理）。
      // SVG 圆形底终稿后 radius/bg 调参退役（真圆不可变形；底色走 fill var 由 hover CSS 管）
      if (!xCirc) return;
      try {
        if (barTune.size !== null) {
          xCirc.style.width = barTune.size + "px";
          xCirc.style.height = barTune.size + "px";
          var svgEl = xCirc.querySelector("svg");
          if (svgEl) { svgEl.setAttribute("width", String(barTune.size)); svgEl.setAttribute("height", String(barTune.size)); svgEl.setAttribute("viewBox", "0 0 " + barTune.size + " " + barTune.size); }
        }
      } catch (eT) { /* ignore */ }
    }
    function barApplyTune() {
      try {
        var barEl = document.querySelector('[data-dsh-easyrewrite="recall-bar"]');
        if (!barEl) return "recall-bar 不在 DOM（需先进入撤回态）";
        var xCirc = barEl.querySelector(".dbe-recall-x-circ");
        var cardEl = document.querySelector('[data-composer-card="true"]');
        var firstImg = null;
        try { firstImg = cardEl ? cardEl.querySelector("img") : null; } catch (eI) { /* ignore */ }
        // inset 不在此处直接写 —— placeBar（effect 闭包）会在 MutationObserver 触发时无条件重写 padding，
        // 直接写会被瞬间覆盖（"set 了但没变化"的根因）。改为派发事件让 placeBar 用最新 barTune 重算。
        if (barTune.inset !== null) {
          try { document.dispatchEvent(new CustomEvent("dsh-easyrewrite:bar-tune")); } catch (eE) { /* ignore */ }
        }
        if (xCirc) barApplyCircTune(xCirc);
        return "applied: " + JSON.stringify(barTune);
      } catch (eA) { return "ERR: " + (eA && eA.message); }
    }
    function barDiagnose() {
      // 找出所有命中 .dbe-recall-x / -circ 且带 border-radius 的规则（含 !important），定位"压圆"真凶
      var hits = [];
      try {
        for (var si = 0; si < document.styleSheets.length; si++) {
          var sheet = document.styleSheets[si];
          var rules; try { rules = sheet.cssRules; } catch (eC) { continue; }
          if (!rules) continue;
          for (var ri = 0; ri < rules.length; ri++) {
            var t = rules[ri].cssText || "";
            if (t.indexOf("dbe-recall-x") !== -1 && t.indexOf("radius") !== -1) hits.push("sheet" + si + ": " + t.slice(0, 220));
          }
        }
      } catch (eD) { hits.push("ERR: " + (eD && eD.message)); }
      var out = { hits: hits };
      try {
        var c = document.querySelector(".dbe-recall-x-circ");
        if (c) {
          var cs = getComputedStyle(c);
          out.computed = { borderRadius: cs.borderRadius, width: cs.width, height: cs.height, display: cs.display, boxSizing: cs.boxSizing };
        } else out.computed = "circ 不在 DOM";
      } catch (eG) { out.computed = "ERR: " + (eG && eG.message); }
      return out;
    }
    // 图片桥接：旧会话 live 时把消息附件取成字节，注册进官方全局 draftAttachments 单例（不进输入框），
    // 返回新草稿 id列表——供新会话 resume 时 addImages 使用（撤回键/气泡编辑两条路径共用）。
    async function bridgeSessionImages(sessionId, refs) {
      var out = [];
      try {
        if (!refs || !refs.length) return out;
        var files = [];
        for (var i = 0; i < refs.length; i++) {
          var ref = refs[i];
          if (!ref || typeof ref.attachmentId !== "string") { log("warn", "attach", "桥接跳过：缺 attachmentId", { i: i }); continue; }
          try {
            var url = await resolveImageCompat(sessionId, ref, null);
            if (!url) { log("warn", "attach", "桥接空 URL", { attachmentId: ref.attachmentId }); continue; }
            var resp2 = await fetch(url);
            if (!resp2.ok) { log("warn", "attach", "桥接 fetch 失败", { status: resp2.status }); continue; }
            var blob = await resp2.blob();
            var nm = (ref.name && typeof ref.name === "string") ? ref.name : ("attachment." + (ref.mediaType === "image/png" ? "png" : (ref.mediaType === "image/jpeg" || ref.mediaType === "image/jpg" ? "jpg" : "img")));
            files.push(new File([blob], nm, { type: ref.mediaType || blob.type || "application/octet-stream" }));
          } catch (eOne) { log("warn", "attach", "桥接单个附件失败", { attachmentId: ref.attachmentId, err: String(eOne && eOne.message ? eOne.message : eOne) }); }
        }
        if (files.length > 0) {
          var imgs = createDraftImagesCompat(files, sessionId);
          out = imgs.map(function (im) { return im.id; });
          log("info", "attach", "图片桥接完成（进官方单例）", { count: out.length });
        }
      } catch (e) { log("warn", "attach", "bridgeSessionImages 异常", { err: String(e && e.message ? e.message : e) }); }
      return out;
    }

export {
  barTune,
  barApplyCircTune,
  barApplyTune,
  barDiagnose,
  bridgeSessionImages
};
