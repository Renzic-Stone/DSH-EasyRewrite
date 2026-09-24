
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


export {
  findPrimaryButton,
  isStopButton,
  primaryButtonSendingTimer,
  setPrimaryButtonSendingState
};
