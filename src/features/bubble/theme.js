
import { serviceRefs } from "../../core/services.js";
import { cachedRebuiltFiles, setDraggedAttachment, clearDraggedAttachment } from "./attachments.js";

    var FILE_CARD_SELECTOR = "[data-dsh-easyrewrite-file-card], .dsh-easyrewrite-file-card, [data-easyrewrite-file-card], [data-easyrewrite-img-card], [class*='_card'][class*='FileCard'], div[class*='gSkjMW_card']";

    function installGlobalFileCardDragSupport() {
      if (typeof window === "undefined" || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
      // 支持 HMR 热重载：若已有旧版监听则先卸载，并清理曾被旧版误标记在输入框卡片上的 draggable 属性
      if (typeof window.__dshEasyRewriteCardDragDispose === "function") {
        try { window.__dshEasyRewriteCardDragDispose(); } catch (eDisp) { /* ignore */ }
      }
      try {
        var pollutedCards = document.querySelectorAll("[data-composer-card][draggable]");
        for (var pci = 0; pci < pollutedCards.length; pci++) {
          pollutedCards[pci].removeAttribute("draggable");
        }
      } catch (eClean) { /* ignore */ }
      window.__dshEasyRewriteCardDragInstalled = true;

      // 1. 鼠标按下时仅对文件/图片附件卡片激活 draggable（严禁匹配底部输入框卡片 [data-composer-card]）
      var onMouseDown = function (e) {
        try {
          var target = e.target;
          if (!target || typeof target.closest !== "function") return;
          if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable || target.closest("textarea, input, [contenteditable='true']")) return;
          var card = target.closest(FILE_CARD_SELECTOR);
          if (card) {
            if (card.hasAttribute("data-composer-card") || card.querySelector("textarea, input, [contenteditable='true']")) return;
            // 如果点击的是卡片内的移除按钮（如 close 图标），不激活拖拽
            if (target.tagName === "BUTTON" || target.closest("button")) return;
            if (!card.getAttribute("draggable")) card.setAttribute("draggable", "true");
          }
        } catch (eMd) { /* ignore */ }
      };
      document.addEventListener("mousedown", onMouseDown, true);

      // 2. 拖拽开始时自动匹配并挂载 File 传输数据
      var onDragStart = function (e) {
        try {
          var target = e.target;
          var card = target && target.closest ? target.closest(FILE_CARD_SELECTOR) : null;
          if (!card || card.hasAttribute("data-composer-card")) return;

          var name = card.getAttribute("title") || "";
          if (!name) {
            var nameEl = card.querySelector("[class*='_name'], .dsh-easyrewrite-file-card span, [data-easyrewrite-file-card] span");
            if (nameEl) name = (nameEl.textContent || "").trim();
          }

          // 寻找匹配的 File 实例
          var foundFile = null;
          try {
            var conv = serviceRefs.conversation;
            if (conv && conv.draftAttachments && typeof conv.draftAttachments.forEach === "function") {
              conv.draftAttachments.forEach(function (att) {
                if (!foundFile && att && att.file instanceof File && (att.file.name === name || !name)) {
                  foundFile = att.file;
                }
              });
            }
          } catch (eConv) { /* ignore */ }

          if (!foundFile) {
            for (var sid in cachedRebuiltFiles) {
              var fList = cachedRebuiltFiles[sid];
              if (Array.isArray(fList)) {
                for (var fi = 0; fi < fList.length; fi++) {
                  if (fList[fi] && fList[fi].name === name) {
                    foundFile = fList[fi];
                    break;
                  }
                }
              }
              if (foundFile) break;
            }
          }

          setDraggedAttachment({
            name: name || "file",
            file: foundFile,
            isFile: true,
            id: "drag-" + Date.now()
          });

          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "copyMove";
            e.dataTransfer.setData("application/x-dsh-easyrewrite-file", JSON.stringify({ name: name || "file", isFile: true }));
            e.dataTransfer.setData("text/plain", name || "file");
            if (foundFile instanceof File && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
              try {
                var u = URL.createObjectURL(foundFile);
                e.dataTransfer.setData("text/uri-list", u);
                var mime = foundFile.type || "application/octet-stream";
                e.dataTransfer.setData("DownloadURL", mime + ":" + (name || "file") + ":" + u);
                setTimeout(function () { try { URL.revokeObjectURL(u); } catch (eU) {} }, 60000);
              } catch (eBlob) {}
            }
          }
        } catch (eDs) { /* ignore */ }
      };
      document.addEventListener("dragstart", onDragStart, true);

      var onDragEnd = function () {
        clearDraggedAttachment();
      };
      document.addEventListener("dragend", onDragEnd, true);

      window.__dshEasyRewriteCardDragDispose = function () {
        document.removeEventListener("mousedown", onMouseDown, true);
        document.removeEventListener("dragstart", onDragStart, true);
        document.removeEventListener("dragend", onDragEnd, true);
      };
    }

    function injectThemeStyle() {
      installGlobalFileCardDragSupport();
      var id = "dsh-easyrewrite-theme";
      if (document.querySelector("style[data-plugin=\"" + id + "\"]") !== null) return null;
      var tag = document.createElement("style");
      tag.dataset.plugin = id;
      tag.textContent =
        "[data-dsh-easyrewrite] .dbe-icon-img{transition:filter .15s}" +
        "body[data-ds-dark-theme] [data-dsh-easyrewrite] .dbe-icon-img{filter:invert(1)}" +
        "@media (hover:hover){[data-dsh-easyrewrite][data-time-hover-root] .dbe-time{opacity:0;transition:opacity 80ms}" +
        "[data-dsh-easyrewrite][data-time-hover-root]:hover .dbe-time,[data-dsh-easyrewrite][data-time-hover-root]:focus-within .dbe-time{opacity:1}}" +
        "[data-dsh-easyrewrite=\"recall-bar\"] .dbe-recall-x:hover .dbe-recall-x-bg{fill:var(--dsw-alias-interactive-bg-active,rgba(128,128,128,0.28))}" +
        "[data-dsh-easyrewrite=\"recall-bar\"] .dbe-recall-x:hover .dbe-recall-x-glyph{stroke:var(--dsw-alias-label-primary)}" +
        "[data-dsh-easyrewrite=\"version-pager\"] .dbe-pager-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.14));color:var(--dsw-alias-label-primary)}" +
        "[data-dsh-easyrewrite-file-card],.dsh-easyrewrite-file-card,[data-easyrewrite-file-card],[data-easyrewrite-img-card],[class*='_card'][class*='FileCard'],div[class*='gSkjMW_card']{" +
        "user-select:none!important;-webkit-user-select:none!important;-moz-user-select:none!important;cursor:grab!important}" +
        "[data-dsh-easyrewrite-file-card] *,.dsh-easyrewrite-file-card *,[data-easyrewrite-file-card] *,[data-easyrewrite-img-card] *,div[class*='gSkjMW_card'] *{" +
        "user-select:none!important;-webkit-user-select:none!important;-moz-user-select:none!important}" +
        "[data-dsh-easyrewrite-file-card]:active,.dsh-easyrewrite-file-card:active,[data-easyrewrite-file-card]:active,[data-easyrewrite-img-card]:active,div[class*='gSkjMW_card']:active{" +
        "cursor:grabbing!important}";
      document.head.appendChild(tag);
      return tag;
    }


export { injectThemeStyle, installGlobalFileCardDragSupport };
