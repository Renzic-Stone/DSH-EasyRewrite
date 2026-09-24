
import { log } from "../../core/log.js";

    /** 定位主发送/停止按钮（官方 card 区域内） */
    function findPrimaryButton() {
      try {
        var card = document.querySelector("[data-composer-card]");
        if (!card) return null;
        var btns = card.querySelectorAll("button[aria-label]");
        for (var i = 0; i < btns.length; i++) {
          var al = (btns[i].getAttribute("aria-label") || "").toLowerCase();
          if (al.indexOf("发送") !== -1 || al.indexOf("send") !== -1 || al.indexOf("停止") !== -1 || al.indexOf("stop") !== -1) return btns[i];
        }
      } catch (e) { /* ignore */ }
      return null;
    }

    /** 判断按钮是否为运行中的「停止生成」按钮 */
    function isStopButton(btn) {
      if (!btn) return false;
      var al = (btn.getAttribute("aria-label") || "").toLowerCase();
      return al.indexOf("停止") !== -1 || al.indexOf("stop") !== -1;
    }

    var primaryButtonSendingTimer = null;
    /** 发送按钮置灰与状态锁：长对话 fork/切换期间置灰且设为不可点击，防二次击穿 */
    function setPrimaryButtonSendingState(sending) {
      try {
        var btn = findPrimaryButton();
        if (primaryButtonSendingTimer) {
          clearTimeout(primaryButtonSendingTimer);
          primaryButtonSendingTimer = null;
        }
        if (!btn) return;
        if (sending) {
          btn.setAttribute("data-dsh-easyrewrite-sending", "true");
          btn.disabled = true;
          btn.style.setProperty("opacity", "0.45", "important");
          btn.style.setProperty("pointer-events", "none", "important");
          btn.style.setProperty("cursor", "not-allowed", "important");
          btn.style.setProperty("filter", "grayscale(1)", "important");
          // 15 秒超时兜底解锁（防任何异常或宿主卡死导致按钮永久置灰）
          primaryButtonSendingTimer = setTimeout(function () {
            setPrimaryButtonSendingState(false);
          }, 15000);
        } else {
          btn.removeAttribute("data-dsh-easyrewrite-sending");
          btn.disabled = false;
          btn.style.removeProperty("opacity");
          btn.style.removeProperty("pointer-events");
          btn.style.removeProperty("cursor");
          btn.style.removeProperty("filter");
        }
      } catch (e) { /* ignore */ }
    }

    // 稳健读取输入框当前文本：DOM 物理渲染优先 + projection 编辑器层 + state 快照兜底
    function readCurrentComposerText(fallbackText, props) {
      var domVal = "";
      var projVal = "";
      var snapVal = "";
      var ishell = (props && props.inputState) || null;

      // 1) DOM 物理读取（最高优先级）：直接获取用户在页面中实时敲入的内容（兼容 contenteditable 与 textarea）
      try {
        var el = document.querySelector([
          "[data-input-scroll] [contenteditable='true']",
          "[data-input-scroll] textarea",
          "[data-composer-card='true'] [contenteditable='true']",
          "[data-composer-card='true'] textarea",
          "[contenteditable='true']",
          "textarea"
        ].join(","));
        if (el) {
          if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
            var t = typeof el.innerText === "string" ? el.innerText : (el.textContent || "");
            domVal = t.replace(/\r?\n$/g, "");
          } else if (typeof el.value === "string") {
            domVal = el.value;
          }
        }
      } catch (eDom) { /* ignore */ }

      // 2) 官方 Lexical 编辑器 projection 剪贴板文本
      try {
        if (ishell && ishell.projection && typeof ishell.projection.clipboardText === "string") {
          projVal = ishell.projection.clipboardText;
        }
      } catch (eProj) { /* ignore */ }

      // 3) 官方 state 快照（注意：打字过程中官方并未调用 publish，仅初次 setDraft 时落入）
      try {
        if (ishell && ishell.state && typeof ishell.state.getSnapshot === "function") {
          var snap = ishell.state.getSnapshot();
          if (snap && typeof snap.draft === "string") snapVal = snap.draft;
        } else if (ishell && typeof ishell.draft === "string") {
          snapVal = ishell.draft;
        }
      } catch (eSnap) { /* ignore */ }

      var chosen = fallbackText;
      var source = "fallback";

      if (domVal !== "") {
        chosen = domVal;
        source = "dom";
      } else if (projVal !== "") {
        chosen = projVal;
        source = "projection";
      } else if (snapVal !== "") {
        chosen = snapVal;
        source = "snapshot";
      }

      log("info", "recall", "输入框文本读取诊断", {
        source: source,
        chosenLen: typeof chosen === "string" ? chosen.length : 0,
        domLen: domVal.length,
        projLen: projVal.length,
        snapLen: snapVal.length
      });

      return chosen;
    }

export {
  findPrimaryButton,
  isStopButton,
  primaryButtonSendingTimer,
  setPrimaryButtonSendingState,
  readCurrentComposerText
};
