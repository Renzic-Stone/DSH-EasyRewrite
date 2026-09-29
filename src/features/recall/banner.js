import * as React from "react";
import { log } from "../../core/log.js";
import { useUILocaleDict } from "../../core/i18n.js";
import { recallVisualMode, draftConflictMode, hasChatSnapshot, getChatSnapshot } from "../../core/constants.js";
import { formatClock } from "../../core/ui.js";
import { usePending, readPending, writePending } from "./store.js";
import { barApplyTune, barApplyCircTune, barTune } from "./tune.js";
import { safeOpenSession } from "./safe-session.js";
import { resetConversation } from "../history/pager.js";
import { requestCleanGhostQueue } from "./ghost.js";
import { findPrimaryButton, isStopButton, setPrimaryButtonSendingState, readCurrentComposerText } from "./buttons.js";
import { pendingAttachIds, clearPendingAttachIds, latestInputImageIds } from "../bubble/attachments.js";
import {
  addInputImagesCompat,
  removeInputImageCompat,
  pruneInputImagesCompat,
  getInputImageIdsCompat
} from "../../core/services.js";

    function RecallBanner(props) {
      var sessionId = props.sessionId;
      var L = useUILocaleDict();
      var pending = usePending(sessionId);
      var active = pending && pending.type === "recall";
      var sendingRef = React.useRef(false);
      var barRef = React.useRef(null);

      React.useEffect(function () {
        if (!active) return;
        // 注意：textarea 是 absolute 定位（覆盖在 mirror 上），不能插进其父容器；
        // 条注入到输入滚动区（[data-input-scroll]）正前方——卡片内部、文本输入区上方，
        // 正常流布局不重叠，输入卡片随之向上扩展、文本位置不变。
        var scrollEl = document.querySelector("[data-input-scroll]");
        if (!scrollEl || !scrollEl.parentNode) return;
        var bar = document.createElement("div");
        barRef.current = bar;
        bar.setAttribute("data-dsh-easyrewrite", "recall-bar");
        // bar 外挂且宽度动态=card 宽 → 左右零 margin/padding，label 与 × 直达 card 左右边缘（与输入框严格对齐；
        // margin:0 16px + 水平 padding 是分割线时代遗物，2026-09-04 用户反馈"离边框有点距离"后移除）
        // 内容靠上（相对分割线留出下间距）；标签灰色药丸底；× 圆形底（hover 高亮见注入样式）
        bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin:0;padding:2px 0 6px;";
        var label = document.createElement("span");
        // 标签药丸只包裹文字（内容宽度）；透明 spacer 撑开剩余空间把 × 推到最右
        label.style.cssText = "font-size:15.4px;color:var(--dsw-alias-label-secondary);line-height:24.2px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.12));border-radius:999px;padding:1.1px 13.2px;";
        var spacer = document.createElement("div");
        spacer.style.cssText = "flex:1;";
        label.textContent = L.modifying;
        var xBtn = document.createElement("button");
        xBtn.type = "button";
        xBtn.title = L.cancelRecall;
        xBtn.setAttribute("aria-label", L.cancelRecall);
        xBtn.className = "dbe-recall-x";
        xBtn.style.cssText = "border:none;cursor:pointer;transform:translateY(-1px);padding:0;background:transparent;display:inline-flex;align-items:center;justify-content:center;flex:none;";
        // 圆形底终稿（2026-09-04）：SVG <circle> 画底——border-radius 被宿主某条未知规则吃掉（涂红实测是圆角方块），
        // SVG 几何不受任何 CSS 圆角模板影响，保证真圆。× 字符绝对定位居中。hover 态用 fill 过渡 + 注入样式色变。
        var xCirc = document.createElement("span");
        xCirc.className = "dbe-recall-x-circ";
        // 22px：用户反馈 26.4 太大（2026-09-04）；viewBox 保持 26.4 等比缩放，描边 2.2 补偿缩小变细
        xCirc.style.cssText = "position:relative;width:22px;height:22px;display:block;pointer-events:none;";
        var NSX = "http://www.w3.org/2000/svg";
        var xSvg = document.createElementNS(NSX, "svg");
        xSvg.setAttribute("width", "22");
        xSvg.setAttribute("height", "22");
        xSvg.setAttribute("viewBox", "0 0 26.4 26.4");
        xSvg.style.cssText = "display:block;width:100%;height:100%;";
        var xCircleEl = document.createElementNS(NSX, "circle");
        xCircleEl.setAttribute("cx", "13.2");
        xCircleEl.setAttribute("cy", "13.2");
        xCircleEl.setAttribute("r", "13.2");
        xCircleEl.setAttribute("class", "dbe-recall-x-bg");
        xCircleEl.setAttribute("fill", "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.14))");
        xSvg.appendChild(xCircleEl);
        // × 用两条对角线画（几何级居中，无字体基线/transform 补偿问题——字符方案实测偏左下）
        var xGlyph = document.createElementNS(NSX, "g");
        xGlyph.setAttribute("class", "dbe-recall-x-glyph");
        xGlyph.setAttribute("stroke", "var(--dsw-alias-label-secondary)");
        xGlyph.setAttribute("stroke-width", "2.2");
        xGlyph.setAttribute("stroke-linecap", "round");
        var l1 = document.createElementNS(NSX, "line");
        l1.setAttribute("x1", "8.2"); l1.setAttribute("y1", "8.2");
        l1.setAttribute("x2", "18.2"); l1.setAttribute("y2", "18.2");
        var l2 = document.createElementNS(NSX, "line");
        l2.setAttribute("x1", "18.2"); l2.setAttribute("y1", "8.2");
        l2.setAttribute("x2", "8.2"); l2.setAttribute("y2", "18.2");
        xGlyph.appendChild(l1);
        xGlyph.appendChild(l2);
        xSvg.appendChild(xGlyph);
        xCirc.appendChild(xSvg);
        xBtn.appendChild(xCirc);
        xBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          var ia = props.inputActions;
          if (ia && typeof ia.setDraft === "function" && typeof pending.originalDraft === "string") {
            ia.setDraft(pending.originalDraft); // 恢复输入框原草稿（覆盖/合并统一恢复）
          }
          // 取消撤回：目标终态=仅保留用户确认前已有的图（preUserImageIds）；移除其余（重建的消息图等）
          // v2.4.0 rc.1联测修复：清理步骤拆为独立防御段（每段单独try+日志），任何一段失败不拖垮其余；
          // 输入态读取双宿主兼容（props.useInput / props.inputState）
          var keepArr = Array.isArray(pending.preUserImageIds) ? pending.preUserImageIds : [];
          var curX = [];
          try {
            curX = getInputImageIdsCompat(props.inputState);
          } catch (eRead) { log("warn", "recall", "× 读取输入框图片清单失败", { err: String(eRead && eRead.message ? eRead.message : eRead) }); }
          var removedAny = false;
          for (var ci = 0; ci < curX.length; ci++) {
            if (keepArr.indexOf(curX[ci]) !== -1) continue;
            try {
              if (removeInputImageCompat(ia, curX[ci])) removedAny = true;
            } catch (e3) { log("warn", "recall", "× removeImage 单项失败", { id: curX[ci], err: String(e3 && e3.message ? e3.message : e3) }); }
          }
          if (curX.length > 0) {
            try { pruneInputImagesCompat(ia, keepArr); } catch (e4) { log("warn", "recall", "× pruneImages 失败", { err: String(e4 && e4.message ? e4.message : e4) }); }
          }
          log("info", "recall", "× 清理完成", { before: curX.length, keep: keepArr.length, removedAny: removedAny });
          clearPendingAttachIds();
          writePending(sessionId, null);
          log("info", "recall", "pending cancelled（恢复原草稿+清除重建图片）");
        });
        bar.appendChild(label);
        bar.appendChild(spacer);
        bar.appendChild(xBtn);
        // 插入到最顶部：优先 composer card 的第一个子节点之前（官方 attachments 附件区上方）
        var cardEl = null;
        try { cardEl = document.querySelector('[data-composer-card="true"]') || null; } catch (e) { /* ignore */ }
        function placeBar() {
          try {
            var cEl = document.querySelector('[data-composer-card="true"]') || null;
            if (!cEl || !cEl.parentNode) return;
            // 统一外挂：card 之前（独立于对话框正上方），宽度动态=card 实际宽度 → 左右缘与输入卡片严格对齐
            // 样式统一用带图形态（无分界线）——不再按 hasImages 动态切换挂载点与边框
            if (bar.parentNode !== cEl.parentNode) cEl.parentNode.insertBefore(bar, cEl);
            var cr = cEl.getBoundingClientRect();
            bar.style.width = cr.width + "px";
            bar.style.boxSizing = "border-box";
            // 对齐锚点（2026-09-04 用户定稿）：带图=label 左缘对齐第一张小预览图的左缘；纯文字=card 圆角零点。
            // X 右缘对称内缩同值。实测 DOM 而非猜数字，官方改预览区内边距也自动跟随。
            // 两锚点各配各的固化偏移（均为负=向外）：带图 -7、纯文字 -16（用户调试台分别实测，2026-09-04 定稿）；
            // barTune.inset（调试 API set）非 null 时为覆盖语义（相对锚点的绝对偏移），null=用固化值
            var TUNE_WITH_IMG = -7;
            var TUNE_TEXT_ONLY = -16;
            var inset = 16;
            try {
              var firstImg = cEl.querySelector("img");
              var cRect = cEl.getBoundingClientRect();
              var anchor = null, tune = null;
              if (firstImg) {
                anchor = firstImg.getBoundingClientRect().left - cRect.left;
                tune = TUNE_WITH_IMG;
              } else {
                anchor = parseFloat(getComputedStyle(cEl).borderTopLeftRadius) || 16;
                tune = TUNE_TEXT_ONLY;
              }
              if (anchor !== null) inset = Math.max(0, anchor + (barTune.inset !== null ? barTune.inset : tune));
            } catch (eR) { /* ignore */ }
            bar.style.paddingLeft = inset + "px";
            bar.style.paddingRight = inset + "px";
            // 官方重渲染重建 bar 后恢复圆钮调参（size/radius/bg），否则第二次进入撤回态调参"失效"
            barApplyCircTune(bar.querySelector(".dbe-recall-x-circ"));
          } catch (e) { /* ignore */ }
        }
        placeBar();
        // 调参事件：__dshEasyRewrite.bar.set({inset}) → 重算（barTune 已更新，placeBar 读它）
        var onBarTune = function () { try { placeBar(); } catch (eBT) { /* ignore */ } };
        document.addEventListener("dsh-easyrewrite:bar-tune", onBarTune);
        // MutationObserver：官方重渲染 composer（如点击图片删除键）挤掉 bar 后自动复位，× 一直可用
        var mo = null;
        try {
          mo = new MutationObserver(function () { try { placeBar(); } catch (e) { /* ignore */ } });
          var obCard = cardEl || (document.querySelector('[data-composer-card="true"]') || null);
          if (obCard) mo.observe(obCard, { childList: true, subtree: true });
        } catch (e) { /* ignore */ }
        return function () {
          try { if (mo) mo.disconnect(); } catch (e) { /* ignore */ }
          try { document.removeEventListener("dsh-easyrewrite:bar-tune", onBarTune); } catch (eBT2) { /* ignore */ }
        var onWinResize = function () { try { placeBar(); } catch (e) { /* ignore */ } };
        window.addEventListener("resize", onWinResize);
          try { window.removeEventListener("resize", onWinResize); } catch (e4) { /* ignore */ }
          if (bar.parentNode) bar.parentNode.removeChild(bar);
          barRef.current = null;
        };
      }, [active, sessionId, pending]);

      // ---- 异常退出恢复：本地无 pending（缓存丢了/跨浏览器）且存在文件备份时，恢复草稿 ----
      // （正常路径：发送/× 时备份已删除，恢复永远不会覆盖用户当前状态）
      var backupRecovered = React.useRef({});
      React.useEffect(function () {
        if (backupRecovered.current[sessionId]) return;
        var local = readPending(sessionId);
        if (local) return; // 有网页缓存（localStorage）→ 用缓存，不查文件
        backupRecovered.current[sessionId] = true;
        try {
          fetch("/bubble/backup/read", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: sessionId }),
            keepalive: true
          }).then(function (resp) { return resp.json(); }).then(function (data) {
            if (data && data.ok && data.pending) {
              // review M7：备份新鲜度校验——超过 24h 的备份视为陈旧（可能已被取消但删除未落地），不恢复
              var age = Date.now() - (typeof data.pending.updatedAt === "number" ? data.pending.updatedAt : 0);
              if (age > 24 * 3600 * 1000) {
                log("warn", "backup", "备份陈旧（>24h），跳过恢复", { sessionId: sessionId, ageMs: age });
                return;
              }
              writePending(sessionId, data.pending);
              if (data.pending.type === "recall" && props.inputActions && typeof props.inputActions.setDraft === "function") {
                props.inputActions.setDraft(data.pending.draftText); // 回填输入框
              }
              log("info", "backup", "异常退出恢复：从文件备份恢复草稿", { sessionId: sessionId, type: data.pending.type });
            }
          }).catch(function () { /* 静默 */ });
        } catch (e) { /* 静默 */ }
      }, [sessionId]);

      // ---- 草稿自动备份（无感）：pending 存在且超过 10s 后，若有新改动则每 5s 覆盖备份一次 ----
      var lastBackupMetaRef = React.useRef({});
      React.useEffect(function () {
        if (!active || !pending) return;
        var meta = lastBackupMetaRef.current[sessionId] || (lastBackupMetaRef.current[sessionId] = { time: 0, updatedAt: 0 });
        function backupNow() {
          try {
            var currentUpdatedAt = pending.updatedAt || 0;
            meta.time = Date.now();
            meta.updatedAt = currentUpdatedAt;
            fetch("/bubble/backup", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sessionId, pending: pending }),
              keepalive: true
            }).catch(function (e) {
              log("warn", "backup", "自动备份请求失败", { err: String(e && e.message ? e.message : e) });
            });
          } catch (e) { /* 静默 */ }
        }
        var timer = setInterval(function () {
          var age = Date.now() - (pending.updatedAt || 0);
          // 仅在满 10s，且距离上次备份已过 5s，且该版本草稿尚未备份过时才发起
          if (age >= 10000 && Date.now() - meta.time >= 5000 && pending.updatedAt !== meta.updatedAt) {
            backupNow();
          }
        }, 1000);
        return function () { clearInterval(timer); };
      }, [active, pending, sessionId]);

      // ---- 后续 context 隐藏（minimal/simple 模式）：DOM 层隐藏本行之后的所有内容行 ----
      var hiddenRows = React.useRef(new Set());
      function applyHideAfter(list, targetKey) {
        var rows = list.querySelectorAll("[data-chat-anchor-key]");
        var started = false;
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (!started) {
            if (row.dataset && row.dataset.chatAnchorKey === targetKey) { started = true; }
            continue;
          }
          if (!hiddenRows.current.has(row)) {
            row.style.display = "none";
            hiddenRows.current.add(row);
          }
        }
      }
      function restoreHiddenRows() {
        hiddenRows.current.forEach(function (el) { el.style.display = ""; });
        hiddenRows.current.clear();
      }
      React.useEffect(function () {
        if (!active || !pending) return;
        var mode = pending.visualMode || "minimal";
        if (mode !== "minimal" && mode !== "simple") return; // info 模式不隐藏后续
        var list = document.querySelector("[data-chat-flow]");
        if (!list) return;
        applyHideAfter(list, pending.targetKey);
        var mo = new MutationObserver(function () { applyHideAfter(list, pending.targetKey); });
        mo.observe(list, { childList: true, subtree: true });
        return function () { mo.disconnect(); restoreHiddenRows(); };
      }, [active, pending, sessionId]);

      // ---- 发送钩子：pending 存在时拦截 Enter 与发送按钮，先真正撤回再发送 ----
      // （findPrimaryButton / isStopButton / setPrimaryButtonSendingState 在模块级已定义）
      // 撤回发送失败的可见提示：输入滚动区上方插入临时错误条（3.5s 自动移除）
      function showRecallError(text) {
        try {
          var scrollEl = document.querySelector("[data-input-scroll]");
          if (!scrollEl || !scrollEl.parentNode) return;
          var bar = document.createElement("div");
          bar.setAttribute("data-dsh-easyrewrite", "recall-error");
          bar.textContent = text;
          bar.style.cssText = "margin:0 16px;padding:4px 10px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error,#d9534f);background:var(--dsw-alias-bg-l2,rgba(128,128,128,0.08));border-radius:8px;";
          scrollEl.parentNode.insertBefore(bar, scrollEl);
          setTimeout(function () { try { if (bar.parentNode) bar.parentNode.removeChild(bar); } catch (e) { /* ignore */ } }, 3500);
        } catch (e) { /* ignore */ }
      }
      // review #7：client 直算撤回边界——倒序扫 targetSeq 之前最近的闭合 turn-tail，
      // atSeq = closing.finalNode.seq（与官方 fork(atSeq) 的 find(turn/end && seq>=atSeq) 恰好对齐）。
      // 判定树：命中 → {atSeq}；窗口内无且 hasMore=false → 真首条 {code:"no-boundary"}；
      // 窗口内无但 hasMore=true → 快照窗口外，{code:"host-fallback"} 走保留的 host 路由。
      function computeRecallBoundary(props, targetSeq) {
        try {
          if (!hasChatSnapshot(props)) return null; // 无法本地判定 → host fallback
          var snapshot = getChatSnapshot(props);
          if (!snapshot || !Array.isArray(snapshot.order) || !snapshot.nodes || typeof snapshot.nodes.get !== "function") return null;
          var order = snapshot.order;
          var tIdx = -1;
          for (var i = 0; i < order.length; i++) {
            var nd = snapshot.nodes.get(order[i]);
            if (!nd || nd.kind !== "user") continue;
            var sq = nd.data && typeof nd.data.seq === "number" ? nd.data.seq : (typeof nd.anchorSeq === "number" ? nd.anchorSeq : -1);
            if (sq === targetSeq) { tIdx = i; break; }
          }
          if (tIdx === -1) return null; // 目标不在快照 → host fallback
          for (var k = tIdx - 1; k >= 0; k--) {
            var n2 = snapshot.nodes.get(order[k]);
            if (!n2 || n2.kind !== "turn-tail") continue;
            var cl = n2.data && n2.data.closing;
            if (cl && cl.finalNode && typeof cl.finalNode.seq === "number") return { atSeq: cl.finalNode.seq };
            // closing 缺失（纯工具/无文本回合）→ 回退尾节点自身 seq（官方槽位同款 closing?.finalNode.seq ?? data.seq），
            // 跳过会把边界推得更早、整段误切
            if (n2.data && typeof n2.data.seq === "number") return { atSeq: n2.data.seq };
          }
          var hasMore = snapshot.hasMore === true;
          return hasMore ? { code: "host-fallback" } : { code: "no-boundary" };
        } catch (e) {
          log("warn", "recall", "本地边界计算异常", { err: String(e && e.message ? e.message : e) });
          return null;
        }
      }

      async function doRecallThenSend(p) {
        if (sendingRef.current) return;
        sendingRef.current = true;
        setPrimaryButtonSendingState(true);

        // 视觉反馈：更新撤回条标签为「正在准备新会话…」
        try {
          if (barRef.current) {
            var labelEl = barRef.current.querySelector("span");
            if (labelEl) {
              labelEl.textContent = L.preparingSession || "正在准备新会话…";
              labelEl.style.opacity = "0.75";
            }
          }
        } catch (eUi) { /* ignore */ }

        try {
          var sid = props.sessionId;
          // 读取输入框当前文本（用户可能已修改）：重置/重发都使用修改后的内容
          var sendText = readCurrentComposerText(p.draftText, props);
          // 极限场景判定（v2.4.0 改约）：窗口化快照上的 isFirstUserMessage 会误判（窗口起点=目标消息即误报首条），
          // 首条/截断场景统一交给宿主判定树——/bubble/recall 返回 no-boundary/turn-open 时再走 resetConversation。
          // 本地只保留快照可判时的提前短路（no-boundary）。
          // v2.1.1：fork 前捕获当前模型/思考挡位（选择器真值），随 resume 标记带到新会话
          var msel = props.modelSel ? props.modelSel.capture(sid) : null;
          // review L5：日志去内容化（只记长度，不落明文）
          log("info", "recall", "发送内容（修改后）", { sendLen: sendText.length, modelSel: !!msel });
          // review #7：client 直算边界（判定树），仅在快照无法判定时走保留的 host 路由 fallback
          var localB = computeRecallBoundary(props, p.targetSeq);
          var boundary = null;
          if (localB && localB.atSeq) {
            boundary = localB.atSeq;
            log("info", "recall", "本地边界就绪", { targetSeq: p.targetSeq, atSeq: boundary });
          } else if (localB && localB.code === "no-boundary") {
            // 真首条（窗口内无闭合回合且无更早历史）→ 重置对话
            log("info", "recall", "本地判定：无前置边界 → 重置对话");
            showRecallError(L.resetNotice);
            resetConversation(sid, "edit", sendText, props, latestInputImageIds.slice());
            return;
          } else {
            // host fallback（localB=null 或 host-fallback）
            log("info", "recall", "本地不可判定，走 host 路由", { mode: localB && localB.code });
            var resp = await fetch("/bubble/recall", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sid, targetSeq: p.targetSeq })
            });
            var data = await resp.json();
            if (!data || !data.ok) {
              var errCode = (data && data.error) || "unknown";
              log("warn", "recall", "撤回失败（发送中止）", { error: errCode });
              if (errCode === "turn-open" || errCode === "no-boundary") {
                showRecallError(L.resetNotice);
                resetConversation(sid, "edit", sendText, props, latestInputImageIds.slice());
              } else {
                showRecallError(L.errGeneric);
                setPrimaryButtonSendingState(false);
                sendingRef.current = false;
              }
              return;
            }
            boundary = data.boundary;
          }
          // 0) 撤回前收集（review #2/#3）：读镜像——UserBubbleView 渲染时已从官方 useInput 快照同步，
          //    覆盖确认时重建的图 + 用户手动加的图 − 用户删除的图（即发送瞬间的真实选择）。
          var imgIds = latestInputImageIds.slice();
          log("info", "attach", "撤回收集完成（镜像 imageIds）", { count: imgIds.length });
          // 1) 官方 client fork：child 进入会话列表（可打开）+ 继承原标题。
          //    官方 fork(atSeq) 即截断边界器；fork-unavailable 按原文子串分流：
          //    "has not completed the turn"=回合未结束→提示等待；"has no completed turn to fork from"=无前置边界→重置对话。
          var newId = null;
          try {
            newId = await props.ctxSessions.fork({ sessionId: sid, atSeq: boundary });
          } catch (e) {
            var em = String(e && e.message ? e.message : e);
            log("error", "recall", "fork 失败（发送中止）", { err: em });
            setPrimaryButtonSendingState(false);
            sendingRef.current = false;
            if (/has not completed the turn/i.test(em)) {
              showRecallError(L.turnOpenNotice || L.errGeneric); // 回合未结束：等待回复完成
            } else if (/has no completed turn to fork from/i.test(em)) {
              showRecallError(L.resetNotice);
              resetConversation(sid, "edit", sendText, props, latestInputImageIds.slice());
            } else {
              showRecallError(L.errGeneric);
            }
            return;
          }
          // Issue #10 根治防御：fork 成功返回即请求 Host 端物理拔除继承的幽灵旧消息
          await requestCleanGhostQueue(newId);
          // review M6：resume-send 带时间戳（30s TTL，防陈旧草稿幽灵自动发送）
          try { localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({ draftText: sendText, t: Date.now(), imageIds: imgIds, sel: msel })); } catch (e) { /* ignore */ }
          // 2) 无痕替换：归档原会话 → 打开新会话
          var archived = false;
          try {
            if (typeof props.ctxWorkspaces !== "undefined" && typeof props.ctxWorkspaces.archiveSession === "function") {
              // review M8：await + catch，避免 unhandled rejection
              await Promise.resolve(props.ctxWorkspaces.archiveSession(sid)).catch(function () { /* ignore */ });
              archived = true;
            }
          } catch (e) { log("warn", "recall", "归档原会话失败", { err: String(e && e.message ? e.message : e) }); }
          log("info", "recall", "撤回完成：归档原会话 + 打开新会话", { newId: newId, archived: archived });

          // 稳健切换会话（多重通道与降级）
          var opened = safeOpenSession(newId, props);
          if (!opened) {
            log("error", "recall", "打开新会话失败，回滚状态", { newId: newId });
            try { localStorage.removeItem("dsh-easyrewrite:resume-send:" + newId); } catch (e) {}
            setPrimaryButtonSendingState(false);
            sendingRef.current = false;
            showRecallError(L.errGeneric);
            return;
          }

          // 确认会话切换派发成功后再清除 pending 数据（保持 sendingRef 保护，直到组件随新会话打开而卸载）
          writePending(sid, null);
        } catch (err) {
          log("error", "recall", "撤回请求失败（发送中止）", { err: String(err && err.message ? err.message : err) });
          setPrimaryButtonSendingState(false);
          sendingRef.current = false;
        }
      }
      React.useEffect(function () {
        if (!active && !sendingRef.current) return;
        var p = pending;
        function onKeyDownCapture(e) {
          if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
          var el = document.querySelector("[data-input-scroll] [contenteditable='true'], [data-input-scroll] textarea, [data-composer-card='true'] [contenteditable='true'], [data-composer-card='true'] textarea, textarea");
          var isComposer = false;
          if (el) {
            isComposer = (e.target === el || el.contains(e.target));
          } else if (e.target && (e.target.isContentEditable || e.target.tagName === "TEXTAREA")) {
            isComposer = true;
          }
          if (!isComposer) return;
          e.preventDefault();
          e.stopPropagation();
          if (sendingRef.current) return; // 正在切换会话，坚决阻断重复触发
          if (p) doRecallThenSend(p);
        }
        function onClickCapture(e) {
          var btn = findPrimaryButton();
          if (!btn || !btn.contains(e.target)) return;
          if (isStopButton(btn)) return; // review M1：停止生成照常放行，不劫持
          e.preventDefault();
          e.stopPropagation();
          if (sendingRef.current) return; // 正在切换会话，坚决阻断重复触发
          if (p) doRecallThenSend(p);
        }
        document.addEventListener("keydown", onKeyDownCapture, true);
        document.addEventListener("click", onClickCapture, true);
        return function () {
          document.removeEventListener("keydown", onKeyDownCapture, true);
          document.removeEventListener("click", onClickCapture, true);
          setPrimaryButtonSendingState(false);
        };
      }, [active, sessionId, pending]);

      // ---- 恢复发送：切换到新会话后，回填草稿并自动提交 ----
      // 健壮化（T315#3）：旧实现进入即删标记、单次尝试——若挂载瞬间 composer 未就绪会静默丢草稿；
      // 现改为：标记保留到真正可发送才消费；轮询 inputActions 就绪（100ms×50）；卸载中断则保留标记，
      // 下次进入该会话在 TTL 内自动重试；每个分支都落日志（日志自己读得懂）。
      var resumeKey = "dsh-easyrewrite:resume-send:" + sessionId;
      React.useEffect(function () {
        var raw = null;
        try { raw = localStorage.getItem(resumeKey); } catch (e) { /* ignore */ }
        if (!raw) return;
        var r = null;
        try { r = JSON.parse(raw); } catch (e) { /* ignore */ }
        if (!r || typeof r.draftText !== "string") {
          try { localStorage.removeItem(resumeKey); } catch (e2) { /* ignore */ }
          log("warn", "recall", "resume 标记损坏已清除", { sessionId: sessionId });
          return;
        }
        // review M6：TTL 30 秒——过期（延迟打开/陈旧）不自动发送
        if (typeof r.t === "number" && Date.now() - r.t > 30000) {
          try { localStorage.removeItem(resumeKey); } catch (e3) { /* ignore */ }
          log("warn", "recall", "resume 过期（30s TTL），不自动发送", { sessionId: sessionId });
          return;
        }
        var tries = 0;
        var timer = setInterval(function () {
          tries++;
          var ia = props.inputActions;
          if (!(ia && typeof ia.setDraft === "function" && typeof ia.submit === "function")) {
            if (tries >= 50) {
              clearInterval(timer);
              log("error", "recall", "resume 放弃：composer 5s 未就绪（标记保留待重试）", { sessionId: sessionId, tries: tries });
            }
            return; // 标记未消费——卸载/下次挂载可重试（TTL 兜底）
          }
          clearInterval(timer);
          try { localStorage.removeItem(resumeKey); } catch (e4) { /* ignore */ }
          try {
            ia.setDraft(r.draftText);
            log("info", "recall", "resume：回填草稿并自动发送", { sessionId: sessionId, tries: tries, imgs: Array.isArray(r.imageIds) ? r.imageIds.length : 0, hasSel: !!(r.sel && props.modelSel) });
            // 图片桥接（review #3 简化版）：官方 draftAttachments 全局单例跨会话存活——
            // resume 直接 addImages(发送瞬间的 imageIds) 后 submit；消息内容完全由我们构造，无需校验。
            var savedIds = Array.isArray(r.imageIds) ? r.imageIds : [];
            if (savedIds.length > 0) {
              try { addInputImagesCompat(ia, savedIds); } catch (e) { log("warn", "attach", "addImages 异常（忽略，文字照发）", { err: String(e && e.message ? e.message : e) }); }
            }
            // Issue #10 深度防御：清空宿主 fork 继承而来的悬空 next-turn 幽灵队列
            // DSH 的 sessions.fork 机制会贪婪复制 turn/end 到 turn/start 之间的非回合事件，
            // 导致目标消息当初发送时的 agent/inbox/spliced 入队事件被复制到新会话，
            // 而出队事件被截断丢弃，从而在宿主端留下幽灵消息。
            // 在提交新消息前，向 Host 端发起物理清理，彻底拔除残留幽灵项，
            // 并辅以客户端 snapshot 清理作为次级防御，确保新消息排在队首第一位被消费。
            var cleanGhostQueue = function () {
              return requestCleanGhostQueue(sessionId).then(function (hostRes) {
                if (hostRes && hostRes.cleared > 0) {
                  log("info", "recall", "resume 时 Host 幽灵队列已清空", { sessionId: sessionId, cleared: hostRes.cleared, ids: hostRes.removedIds });
                }
                try {
                  var binding = (props.ctxSessions && typeof props.ctxSessions.binding === "function")
                    ? props.ctxSessions.binding(sessionId)
                    : null;
                  var sessInst = binding ? binding.session : null;
                  var qItems = (sessInst && typeof sessInst.getSnapshot === "function")
                    ? sessInst.getSnapshot().queue
                    : ((props.session && Array.isArray(props.session.queue)) ? props.session.queue : []);
                  var ghostItems = Array.isArray(qItems) ? qItems.filter(function (it) { return it && it.id; }) : [];
                  if (ghostItems.length > 0) {
                    log("info", "recall", "检测到 snapshot 中存在幽灵队列项，开始客户端清理", {
                      sessionId: sessionId,
                      count: ghostItems.length,
                      ids: ghostItems.map(function (it) { return it.id; })
                    });
                    var pList = [];
                    for (var gi = 0; gi < ghostItems.length; gi++) {
                      var gId = ghostItems[gi].id;
                      if (sessInst && typeof sessInst.updateQueue === "function") {
                        try {
                          pList.push(sessInst.updateQueue(gId, { kind: "remove" }));
                        } catch (eUp) {
                          log("warn", "recall", "调用 updateQueue 异常", { id: gId, err: String(eUp && eUp.message ? eUp.message : eUp) });
                        }
                      } else if (typeof props.updateQueue === "function") {
                        try {
                          pList.push(props.updateQueue(gId, { kind: "remove" }));
                        } catch (eUp2) {
                          log("warn", "recall", "调用 props.updateQueue 异常", { id: gId, err: String(eUp2 && eUp2.message ? eUp2.message : eUp2) });
                        }
                      }
                    }
                    if (pList.length > 0) {
                      return Promise.allSettled(pList).then(function () {
                        log("info", "recall", "客户端 snapshot 幽灵队列项清理完成", { count: pList.length });
                      });
                    }
                  }
                } catch (eClean) {
                  log("warn", "recall", "清理客户端幽灵队列异常（继续发送）", { err: String(eClean && eClean.message ? eClean.message : eClean) });
                }
                return Promise.resolve();
              });
            };

            var doSubmit = function () {
              cleanGhostQueue().then(function () {
                setTimeout(function () {
                  try {
                    ia.submit();
                    log("info", "recall", "resume 已提交", { sessionId: sessionId });
                    // Phase 2：底部暂存草稿及图片在新会话中回填保留（隔离发送，不混入气泡重发消息）
                    if (r.stagedDraft && (r.stagedDraft.text || (Array.isArray(r.stagedDraft.imageIds) && r.stagedDraft.imageIds.length > 0))) {
                      setTimeout(function () {
                        try {
                          var stg = r.stagedDraft;
                          if (typeof stg.text === "string" && stg.text.length > 0 && typeof ia.setDraft === "function") {
                            ia.setDraft(stg.text);
                          }
                          var stgImgs = Array.isArray(stg.imageIds) ? stg.imageIds : [];
                          if (stgImgs.length > 0) {
                            addInputImagesCompat(ia, stgImgs);
                          }
                          log("info", "recall", "resume 第二阶段：底部暂存草稿及图片已回填", {
                            hasText: !!(stg.text && stg.text.length > 0),
                            imgCount: stgImgs.length
                          });
                        } catch (eStg) {
                          log("warn", "recall", "回填暂存草稿异常", { err: String(eStg && eStg.message ? eStg.message : eStg) });
                        }
                      }, 160);
                    }
                  } catch (e) { log("error", "recall", "自动发送失败（resume）", { err: String(e && e.message ? e.message : e) }); }
                }, 60);
              });
            };
            // v2.1.1：先把捕获的原模型/挡位写进新会话（官方 selectModel 持久化通道），再自动发送
            if (r.sel && props.modelSel) {
              props.modelSel.apply(sessionId, r.sel).then(doSubmit, doSubmit);
            } else {
              doSubmit();
            }
          } catch (eRun) {
            log("error", "recall", "resume 执行异常", { sessionId: sessionId, err: String(eRun && eRun.message ? eRun.message : eRun) });
          }
        }, 100);
        return function () { clearInterval(timer); };
      }, [sessionId, resumeKey]);

      return null; // 纯 DOM 注入，槽位不渲染内容
    }

export { RecallBanner };
