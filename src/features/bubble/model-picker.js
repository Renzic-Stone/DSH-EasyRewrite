import * as React from "react";
import { useUILocaleDict } from "../../core/i18n.js";
import { log } from "../../core/log.js";

    /** 编辑态模型选择 chip（v2.2）：复刻官方输入框模型选择的两级菜单（模型 / 推理等级）。
     * 数据源=官方 modelDirectories.directoryFor(sessionId).store——与下方输入框同源同款；
     * 惰性提交：选择只写本地 selection，确定发送时才随 resume 应用，不碰官方 store；
     * 面板**向下弹出**（不盖上方文字）；箭头=设置卡同款 SVG 无柄箭头（收起朝下⇄展开朝上旋转动画）；
     * 服务不可用 / 会话不可寻址时整颗 chip 不渲染（优雅降级）；
     * 模型无 reasoning 能力 → 菜单不出现「推理等级」行，chip 也不显示等级。 */
    function EditModelPicker(props) {
      var L = useUILocaleDict();
      var dir = null;
      try {
        var md = props.modelDirectories;
        if (md && typeof md.directoryFor === "function") dir = md.directoryFor(props.sessionId);
      } catch (eDir) { dir = null; }
      var hasStore = !!(dir && dir.store && typeof dir.store.subscribe === "function" && typeof dir.store.getSnapshot === "function");
      var snap = React.useSyncExternalStore(
        hasStore ? function (cb) { return dir.store.subscribe(cb); } : function () { return function () {}; },
        hasStore ? function () { return dir.store.getSnapshot(); } : function () { return null; }
      );
      var menuState = React.useState(false);
      var menuOpen = menuState[0];
      var setMenuOpen = menuState[1];
      var viewState = React.useState("root");
      var view = viewState[0];
      var setView = viewState[1];
      var rootRef = React.useRef(null);
      React.useEffect(function () {
        if (!menuOpen || !dir || typeof dir.load !== "function") return;
        try { dir.load().catch(function () { /* ignore */ }); } catch (eLoad) { /* ignore */ }
      }, [menuOpen]);
      React.useEffect(function () {
        if (!menuOpen) return;
        function onDocClick(e) {
          try { if (rootRef.current && !rootRef.current.contains(e.target)) { setMenuOpen(false); setView("root"); } } catch (eOut) { /* ignore */ }
        }
        document.addEventListener("click", onDocClick, true);
        return function () { document.removeEventListener("click", onDocClick, true); };
      }, [menuOpen]);
      if (!hasStore || !snap) return null;
      var groups = Array.isArray(snap.groups) ? snap.groups : [];
      var cur = snap.current || null;
      var sel = props.selection || (cur ? { provider: cur.provider, model: cur.model, reasoningEffort: cur.reasoningEffort } : null);
      if (!sel && groups.length === 0) return null;
      // 派生：当前生效选择 ↔ 官方 choices 同款结构（provider=group.id, model=model.id）
      var selChoice = null;
      for (var gi = 0; gi < groups.length; gi++) {
        var gGroup = groups[gi];
        var gModels = Array.isArray(gGroup.models) ? gGroup.models : [];
        for (var mi = 0; mi < gModels.length; mi++) {
          if (sel && gGroup.id === sel.provider && gModels[mi].id === sel.model) { selChoice = { group: gGroup, model: gModels[mi] }; break; }
        }
        if (selChoice) break;
      }
      var reasoning = selChoice ? selChoice.model.reasoning : void 0;
      var effectiveEffort = (sel && sel.reasoningEffort !== void 0) ? sel.reasoningEffort : (reasoning && reasoning.defaultEffort !== void 0 ? reasoning.defaultEffort : void 0);
      var effortLabel;
      if (reasoning === void 0) effortLabel = void 0;
      else if (effectiveEffort === void 0) effortLabel = L.effortDefault;
      else {
        var lvFound = null;
        var eAll = Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
        for (var li = 0; li < eAll.length; li++) { if (eAll[li].id === effectiveEffort) { lvFound = eAll[li]; break; } }
        effortLabel = (lvFound && lvFound.name) || String(effectiveEffort);
      }
      var modelLabel = (selChoice && selChoice.model.name) ? selChoice.model.name : (sel ? sel.model : L.modelMenu);
      function pickModel(gid, modelId) {
        props.onChange({ provider: gid, model: modelId });
        setMenuOpen(false); setView("root");
      }
      function pickEffort(effort) {
        var base = sel || (cur ? { provider: cur.provider, model: cur.model } : null);
        if (!base) return;
        var next = { provider: base.provider, model: base.model };
        if (effort !== void 0) next.reasoningEffort = effort;
        props.onChange(next);
        setView("root");
      }
      var hoverBg = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))";
      var chipStyle = { display: "flex", alignItems: "center", gap: "4px", border: "none", background: "transparent", cursor: "pointer", borderRadius: "24px", outline: "none", height: "28px", padding: "0 4px 0 8px", fontSize: "13px", fontWeight: 500, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)", minWidth: "0", maxWidth: "100%" };
      // 向下弹出、锚定整个编辑框（吸附其正下方、左缘与框同x）；token 全对齐官方 ModelSelect CSS
      var menuStyle = { position: "absolute", top: "calc(100% + 8px)", left: "0", zIndex: 20, display: "flex", flexDirection: "column", width: "max-content", minWidth: "250px", maxWidth: "min(420px, calc(100vw - 32px))", maxHeight: "min(360px, calc(100vh - 96px))", overflowY: "auto", background: "var(--dsw-specific-menu, rgba(42,42,46,0.98))", border: "1px solid var(--dsw-alias-border-inverted, rgba(128,128,128,0.25))", borderRadius: "12px", boxShadow: "var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,0.35))", padding: "4px", color: "var(--dsw-alias-label-primary)" };
      var rowBase = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", width: "100%", minHeight: "38px", boxSizing: "border-box", border: "none", background: "transparent", cursor: "pointer", padding: "6px 8px", borderRadius: "10px", font: "inherit", fontSize: "13px", lineHeight: "20px", color: "inherit", textAlign: "left" };
      function rowHover(e, on) { try { e.currentTarget.style.background = on ? hoverBg : "transparent"; } catch (eH) { /* ignore */ } }
      function menuRow(label, value, onClick, key) {
        return React.createElement("button", { key: key, type: "button", style: rowBase, onMouseEnter: function (e) { rowHover(e, true); }, onMouseLeave: function (e) { rowHover(e, false); }, onClick: function (e) { e.stopPropagation(); onClick(); } },
          React.createElement("span", null, label),
          React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--dsw-alias-label-tertiary)" } },
            React.createElement("span", null, value),
            React.createElement("span", null, "›")));
      }
      function backRow(label) {
        return React.createElement("button", { key: "back", type: "button", style: Object.assign({}, rowBase, { minHeight: "32px", padding: "4px 8px" }), onMouseEnter: function (e) { rowHover(e, true); }, onMouseLeave: function (e) { rowHover(e, false); }, onClick: function (e) { e.stopPropagation(); setView("root"); } },
          React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--dsw-alias-label-secondary)" } },
            React.createElement("span", { style: { fontSize: "18px", lineHeight: "18px", fontWeight: 500, flex: "none" } }, "‹"),
            React.createElement("span", { style: { fontSize: "12px" } }, label)));
      }
      var check = React.createElement("span", { style: { color: "var(--dsw-alias-label-primary)", flex: "none" } }, "✓");
      // 设置卡同款 SVG 无柄箭头：收起朝下（rotate 90°）⇄ 展开朝上（rotate 270°），官方旋转动画
      var chevron = React.createElement("svg", {
        width: "14", height: "14", viewBox: "0 0 24 24", "aria-hidden": true,
        style: { color: "var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary))", flex: "none", transition: "transform .12s", transform: menuOpen ? "rotate(270deg)" : "rotate(90deg)" }
      }, React.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }));
      var body;
      if (view === "root") {
        body = [
          menuRow(L.modelMenu, modelLabel, function () { setView("models"); }, "row-model"),
          reasoning ? menuRow(L.effortMenu, effortLabel || L.effortDefault, function () { setView("efforts"); }, "row-effort") : null
        ];
      } else if (view === "models") {
        var kids = [backRow(L.modelMenu)];
        for (var gi2 = 0; gi2 < groups.length; gi2++) {
          var g2 = groups[gi2];
          if (groups.length > 1 && g2.name) kids.push(React.createElement("div", { key: "g" + gi2, style: { position: "sticky", top: "0", zIndex: 1, background: "var(--dsw-specific-menu, rgba(42,42,46,0.98))", padding: "5px 8px 3px", fontSize: "12px", fontWeight: 500, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" } }, g2.name));
          var g2m = Array.isArray(g2.models) ? g2.models : [];
          for (var mj = 0; mj < g2m.length; mj++) {
            (function (gid, model) {
              var selected = !!(sel && gid === sel.provider && model.id === sel.model);
              kids.push(React.createElement("button", { key: gid + ":" + model.id, type: "button", role: "menuitemradio", "aria-checked": selected, title: model.name, style: Object.assign({}, rowBase, { alignItems: "flex-start" }), onMouseEnter: function (e) { rowHover(e, true); }, onMouseLeave: function (e) { rowHover(e, false); }, onClick: function (e) { e.stopPropagation(); pickModel(gid, model.id); } },
                React.createElement("span", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" } },
                  React.createElement("span", null, model.name),
                  model.description ? React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", lineHeight: "16px" } }, model.description) : null),
                selected ? check : null));
            })(g2.id, g2m[mj]);
          }
        }
        body = groups.length === 0
          ? [backRow(L.modelMenu), React.createElement("div", { key: "empty", style: { padding: "10px", fontSize: "13px", lineHeight: "20px", color: "var(--dsw-alias-label-tertiary)" } }, snap.status === "loading" ? L.modelsLoading : L.modelsEmpty)]
          : kids;
      } else {
        var effortChoices = [];
        if (reasoning !== void 0) {
          if (reasoning.defaultEffort === void 0) effortChoices.push({ effort: void 0, label: L.effortDefault });
          var eList = Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
          for (var ei = 0; ei < eList.length; ei++) effortChoices.push({ effort: eList[ei].id, label: eList[ei].name });
        }
        var eKids = [backRow(L.effortMenu)];
        for (var ej = 0; ej < effortChoices.length; ej++) {
          (function (level) {
            var selected = level.effort === effectiveEffort;
            eKids.push(React.createElement("button", { key: String(level.effort), type: "button", role: "menuitemradio", "aria-checked": selected, style: Object.assign({}, rowBase), onMouseEnter: function (e) { rowHover(e, true); }, onMouseLeave: function (e) { rowHover(e, false); }, onClick: function (e) { e.stopPropagation(); pickEffort(level.effort); } },
              React.createElement("span", null, level.label),
              selected ? check : null));
          })(effortChoices[ej]);
        }
        body = eKids;
      }
      return React.createElement("div", { ref: rootRef, style: { display: "inline-block", maxWidth: "60%", minWidth: "0" } },
        React.createElement("button", {
          type: "button", style: chipStyle, title: L.modelMenu + "：" + modelLabel + (effortLabel ? " · " + effortLabel : ""),
          "aria-haspopup": "menu", "aria-expanded": !!menuOpen,
          onMouseEnter: function (e) { rowHover(e, true); }, onMouseLeave: function (e) { rowHover(e, false); },
          onClick: function (e) { e.stopPropagation(); setMenuOpen(!menuOpen); setView("root"); }
        },
          React.createElement("span", { style: { fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: "0" } }, modelLabel),
          effortLabel ? React.createElement("span", { style: { color: "var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary))", flex: "none" } }, effortLabel) : null,
          chevron
        ),
        menuOpen ? React.createElement("div", { role: "menu", style: menuStyle, onClick: function (e) { e.stopPropagation(); } }, body) : null
      );
    }

    /** 撤回待定态展开原文时的单张图片（v2.4.0）：loadImage 异步解析→<img>；圆角+气泡同宽约束，复刻原生气泡内图片观感；失败静默。 */

export { EditModelPicker };
