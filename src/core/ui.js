import * as React from "react";
import { IconCheckOutline, IconCopyOutline } from "./icons.js";
import { useUILocaleDict } from "./i18n.js";
import { log } from "./log.js";
import { messagePreviewSize } from "./constants.js";
import { resolveAttachmentFile } from "./services.js";
import { handleAttachmentDragStart, handleAttachmentDragEnd } from "../features/bubble/attachments.js";

    function extractText(content) {
      var parts = [];
      if (Array.isArray(content)) {
        for (var i = 0; i < content.length; i++) {
          var b = content[i];
          if (b && b.type === "text" && typeof b.text === "string") parts.push(b.text);
        }
      }
      return parts.join("\n");
    }

    // 官方同款 contentParts：把消息 content 拆为 {text, images, files, attachments, rest}
    function contentParts(content) {
      var texts = [];
      var images = [];
      var files = [];
      var attachments = [];
      var rest = [];
      if (Array.isArray(content)) {
        for (var i = 0; i < content.length; i++) {
          var b = content[i];
          if (!b) continue;
          if (b.type === "text" && typeof b.text === "string") {
            texts.push(b.text);
          } else if (b.type === "image" && b.attachment !== void 0) {
            var imgItem = { type: "image", image: { attachment: b.attachment }, attachment: b.attachment };
            images.push({ attachment: b.attachment });
            attachments.push(imgItem);
          } else if (b.type === "file" && b.attachment !== void 0) {
            var fileItem = { type: "file", file: b.attachment, attachment: b.attachment };
            files.push(b.attachment);
            attachments.push(fileItem);
          } else {
            rest.push(b);
          }
        }
      }
      return { text: texts.join(""), images: images, files: files, attachments: attachments, rest: rest };
    }

    function FallbackImageItem(itemProps) {
      var att = itemProps.attachment;
      var loadImage = itemProps.loadImage;
      var onOpenLightbox = itemProps.onOpenLightbox;
      var st = React.useState(null);
      var url = st[0];
      var setUrl = st[1];
      var errSt = React.useState(false);
      var failed = errSt[0];
      var setFailed = errSt[1];

      React.useEffect(function () {
        var alive = true;
        if (typeof loadImage === "function" && att) {
          loadImage(att).then(function (u) {
            if (alive && u) setUrl(u);
          }).catch(function () {
            if (alive) setFailed(true);
          });
        }
        return function () { alive = false; };
      }, [att, loadImage]);

      if (failed) {
        return React.createElement("div", {
          style: {
            width: "64px",
            height: "64px",
            borderRadius: "8px",
            background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            color: "var(--dsw-alias-label-tertiary)"
          }
        }, "图片失效");
      }
      var previewSize = itemProps.previewSize || "standard";
      var isSmall = previewSize === "small";
      if (!url) {
        return React.createElement("div", {
          style: {
            width: "64px",
            height: "64px",
            borderRadius: "8px",
            background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))"
          }
        });
      }

      return React.createElement("img", {
        src: url,
        onClick: function (e) {
          e.stopPropagation();
          if (typeof onOpenLightbox === "function") onOpenLightbox(url);
        },
        style: {
          width: isSmall ? "64px" : "auto",
          height: isSmall ? "64px" : "auto",
          maxWidth: isSmall ? "64px" : "240px",
          maxHeight: isSmall ? "64px" : "240px",
          borderRadius: isSmall ? "8px" : "var(--dsw-radius-xl, 16px)",
          objectFit: "cover",
          cursor: "zoom-in",
          display: "block",
          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))"
        }
      });
    }

    function FallbackImageGallery(galleryProps) {
      var images = galleryProps.images;
      var loadImage = galleryProps.loadImage;
      var previewSize = galleryProps.previewSize || "standard";
      var lbSt = React.useState(null);
      var lightboxUrl = lbSt[0];
      var setLightboxUrl = lbSt[1];

      if (!images || images.length === 0) return null;

      return React.createElement("div", {
        style: {
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          justifyContent: "flex-end",
          marginBottom: "4px"
        }
      },
        images.map(function (item, idx) {
          var att = item.attachment || item;
          return React.createElement(FallbackImageItem, {
            key: att.attachmentId || idx,
            attachment: att,
            loadImage: loadImage,
            previewSize: previewSize,
            onOpenLightbox: function (u) { setLightboxUrl(u); }
          });
        }),
        lightboxUrl ? React.createElement("div", {
          onClick: function () { setLightboxUrl(null); },
          style: {
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out"
          }
        }, React.createElement("img", {
          src: lightboxUrl,
          style: {
            maxWidth: "90vw",
            maxHeight: "90vh",
            objectFit: "contain",
            borderRadius: "6px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
          }
        })) : null
      );
    }

    // 渲染消息图片缩略图：多层级逐级优雅降级（官方 renderMessageImages → 官方图片工厂槽 → 宿主授权 loadImage 自绘画廊）
    function renderMessageImagesCompat(images, props, previewSize) {
      if (!images || images.length === 0) return null;
      var mode = previewSize || (typeof messagePreviewSize === "function" ? messagePreviewSize() : "small");
      var isLarge = (mode === "large");

      // 放大模式且包含多张图：将每张图片按单图独立渲染，还原官方单图完整高度（singleFit 240px长边自适应），与文件大卡片高度协调
      if (isLarge && images.length > 1) {
        var renderedItems = [];
        for (var i = 0; i < images.length; i++) {
          var singleEl = renderMessageImagesCompat([images[i]], props, "large");
          if (singleEl) {
            renderedItems.push(React.createElement("div", {
              key: (images[i] && images[i].attachment && images[i].attachment.attachmentId) || i,
              style: { display: "inline-flex", flex: "none" }
            }, singleEl));
          }
        }
        if (renderedItems.length > 0) {
          return React.createElement("div", {
            className: "dsh-easyrewrite-images-expanded",
            style: { display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end" }
          }, renderedItems);
        }
      }

      // 1. 优先调用宿主下发的 renderMessageImages（兼容 DSH ≤0.1.7）
      if (props && typeof props.renderMessageImages === "function") {
        try {
          var opt = { images: images, align: "end" };
          if (!isLarge) opt.compact = true;
          var el = props.renderMessageImages(opt);
          if (el !== undefined && el !== null) return el;
        } catch (e) {
          log("warn", "attach", "官方 renderMessageImages 渲染抛错", { err: String(e && e.message ? e.message : e) });
        }
      }

      // 2. 尝试调用 DSH 0.2.x 官方图片工厂槽 renderFactorySlot
      if (props && typeof props.renderFactorySlot === "function") {
        try {
          var slotOpt = {
            images: images,
            loadImage: props.loadImage,
            align: "end"
          };
          if (!isLarge) slotOpt.compact = true;
          var slotEl = props.renderFactorySlot("conversation.images.content", slotOpt);
          if (slotEl !== undefined && slotEl !== null) return slotEl;
        } catch (e2) {
          log("warn", "attach", "renderFactorySlot 图片渲染异常", { err: String(e2 && e2.message ? e2.message : e2) });
        }
      }

      // 3. 宿主提供 loadImage 时，使用自绘画廊优雅降级，防止图片丢失
      if (props && typeof props.loadImage === "function") {
        return React.createElement(FallbackImageGallery, { images: images, loadImage: props.loadImage, previewSize: mode });
      }

      log("warn", "attach", "宿主无可用图片渲染通道，图片无法渲染");
      return null;
    }

    function formatFileSize(bytes) {
      if (typeof bytes !== "number" || isNaN(bytes) || bytes <= 0) return "0 B";
      var units = ["B", "KB", "MB", "GB", "TB"];
      var i = Math.floor(Math.log(bytes) / Math.log(1024));
      if (i >= units.length) i = units.length - 1;
      var val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
      return val + " " + units[i];
    }

    function fileExtension(name) {
      if (typeof name !== "string") return "";
      var idx = name.lastIndexOf(".");
      return idx >= 0 ? name.slice(idx + 1) : "";
    }

    function renderFileTypeIcon(name, size) {
      var s = size || 28;
      var ext = fileExtension(name).toUpperCase().slice(0, 4) || "FILE";
      var fontSz = ext.length > 3 ? (s >= 36 ? "8px" : "6px") : (s >= 36 ? "10px" : "7.5px");
      var textY = s >= 36 ? "21" : "19";
      return React.createElement("svg", {
        width: s, height: s, viewBox: "0 0 28 28", fill: "none",
        style: { flex: "none", display: "block" }
      },
        React.createElement("path", {
          d: "M6 3.5C6 2.67157 6.67157 2 7.5 2H17L22 7V24.5C22 25.3284 21.3284 26 20.5 26H7.5C6.67157 26 6 25.3284 6 24.5V3.5Z",
          fill: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))",
          stroke: "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))",
          strokeWidth: "1.2"
        }),
        React.createElement("path", {
          d: "M17 2V7H22",
          fill: "none",
          stroke: "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))",
          strokeWidth: "1.2",
          strokeLinejoin: "round"
        }),
        React.createElement("text", {
          x: "14", y: textY,
          textAnchor: "middle",
          fontSize: fontSz,
          fontWeight: "700",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fill: "var(--dsw-alias-label-secondary)",
          letterSpacing: "0.2px"
        }, ext)
      );
    }

    /** 对话流中气泡上方文件卡片（垂直居中布局：标准大卡片 240x140 / 小方框 64x64 收纳，支持抓取拖拽） */
    function FileCardView(props) {
      var file = props.file || {};
      var name = file.name || "file";
      var bytes = typeof file.bytes === "number" ? file.bytes : (file.size || 0);
      var ext = fileExtension(name).toUpperCase().slice(0, 8);
      var meta = [ext, formatFileSize(bytes)].filter(Boolean).join(" ");
      var onRemove = props.onRemove;
      var fileObjRef = React.useRef(file.file instanceof File ? file.file : null);
      var previewSize = props.previewSize || (typeof messagePreviewSize === "function" ? messagePreviewSize() : "small");
      var isSmall = (previewSize !== "large");

      React.useEffect(function () {
        if (fileObjRef.current) return;
        var alive = true;
        resolveAttachmentFile(props.sessionId, { attachment: file, isFile: true, name: name }, props.props || props).then(function (f) {
          if (alive && f instanceof File) fileObjRef.current = f;
        }).catch(function () {});
        return function () { alive = false; };
      }, [file.attachmentId, props.sessionId]);

      var cardStyle = isSmall ? {
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
        borderRadius: "8px",
        background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))",
        boxSizing: "border-box",
        flex: "none",
        width: "64px",
        height: "64px",
        padding: "6px 4px",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "4px",
        overflow: "hidden",
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        cursor: "grab"
      } : {
        border: "0.5px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.22))",
        borderRadius: "var(--dsw-radius-xl, 16px)",
        background: "var(--dsw-specific-input-major, rgba(128,128,128,0.06))",
        boxSizing: "border-box",
        flex: "0 0 240px",
        width: "240px",
        minHeight: "140px",
        padding: "16px 14px",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "10px",
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        cursor: "grab"
      };

      return React.createElement("span", {
        className: "dsh-easyrewrite-file-card",
        "data-dsh-easyrewrite-file-card": "1",
        "data-preview-size": isSmall ? "small" : "standard",
        draggable: true,
        style: cardStyle,
        title: name + (bytes > 0 ? " (" + formatFileSize(bytes) + ")" : ""),
        onDragStart: function (e) {
          var realFile = fileObjRef.current || (file.file instanceof File ? file.file : null);
          handleAttachmentDragStart(e, {
            id: file.attachmentId,
            name: name,
            file: realFile,
            attachment: file,
            isFile: true
          }, props.sessionId, props.props || props);
        },
        onDragEnd: function (e) {
          handleAttachmentDragEnd(e);
        }
      },
        React.createElement("span", {
          style: {
            flex: "none",
            width: isSmall ? "28px" : "42px",
            height: isSmall ? "28px" : "42px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none"
          }
        },
          renderFileTypeIcon(name, isSmall ? 28 : 42)
        ),
        React.createElement("span", {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: isSmall ? "0" : "3px",
            width: "100%",
            minWidth: 0,
            userSelect: "none",
            pointerEvents: "none"
          }
        },
          React.createElement("span", {
            style: {
              width: "100%",
              maxWidth: "100%",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              color: "var(--dsw-alias-label-primary)",
              fontSize: isSmall ? "11px" : "14px",
              fontWeight: 500,
              lineHeight: isSmall ? "14px" : "20px",
              overflow: "hidden",
              textAlign: "center",
              padding: isSmall ? "0 2px" : "0",
              userSelect: "none"
            }
          }, name),
          isSmall ? null : React.createElement("span", {
            style: {
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              color: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.75))",
              fontSize: "12px",
              lineHeight: "16px",
              overflow: "hidden",
              textAlign: "center",
              userSelect: "none"
            }
          }, meta)
        ),
        onRemove ? React.createElement("button", {
          type: "button",
          onClick: function (e) { e.stopPropagation(); onRemove(); },
          style: {
            position: "absolute", top: isSmall ? "2px" : "6px", right: isSmall ? "2px" : "6px",
            width: "18px", height: "18px",
            borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)",
            color: "#fff", fontSize: "12px", lineHeight: "18px", textAlign: "center",
            cursor: "pointer", padding: "0"
          },
          title: "移除文件"
        }, "\u00d7") : null
      );
    }

    /** 对话流中气泡上方附件渲染：图片画廊 + 官方同款 FileCard 文件卡片 */
    function renderMessageAttachmentsCompat(pc, props, previewSize) {
      if (!pc) return null;
      var images = pc.images || [];
      var files = pc.files || [];
      if (images.length === 0 && files.length === 0) return null;
      var pSize = previewSize || (typeof messagePreviewSize === "function" ? messagePreviewSize() : "small");

      var rowStyle = {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "flex-end",
        gap: "8px",
        maxWidth: "100%",
        marginBottom: "6px"
      };

      return React.createElement("div", {
        className: "dsh-easyrewrite-attachment-row",
        "data-message-attachments": true,
        "data-preview-size": pSize,
        style: rowStyle
      },
        images.length > 0 ? renderMessageImagesCompat(images, props, pSize) : null,
        files.map(function (f, idx) {
          return React.createElement(FileCardView, {
            key: (f && f.attachmentId) ? f.attachmentId : ("file:" + idx),
            file: f,
            sessionId: props && props.sessionId,
            previewSize: pSize,
            props: props
          });
        })
      );
    }

    function iconImg(src, alt, size) {
      var s = size || 18;
      return React.createElement("img", {
        src: src,
        alt: alt,
        width: s,
        height: s,
        className: "dbe-icon-img",
        style: { display: "block" }
      });
    }

    function actionButton(title, ariaLabel, onClick, children, dataAttr) {
      var bs = 34;
      return React.createElement("button", {
        type: "button",
        title: title,
        "aria-label": ariaLabel,
        "data-dsh-easyrewrite": dataAttr || undefined,
        style: {
          border: "none",
          background: "transparent",
          cursor: "pointer",
          width: bs,
          height: bs,
          padding: 0,
          borderRadius: "8px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center"
        },
        onMouseEnter: function (e) { e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))"; },
        onMouseLeave: function (e) { e.currentTarget.style.background = "transparent"; },
        onClick: onClick
      }, children);
    }


    function pad2(n) { return n < 10 ? "0" + n : "" + n; }
    function formatClock(time) {
      if (typeof time !== "number" || !isFinite(time)) return "";
      var d = new Date(time);
      var n = new Date();
      var clock = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
      if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
      if (d.getFullYear() === n.getFullYear()) return (d.getMonth() + 1) + "/" + d.getDate() + " " + clock;
      return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + clock;
    }

    /**
     * 统计当前消息之后的内容条数。
     * seqField: "seq"（legacy nodes）或 "anchorSeq"（chat store）。
     * onlyUser: 仅统计用户提问消息（kind === "user"），即「撤回提示统计仅包含用户提问语句」开关。
     */

    /** 复制键：官方 IconCopyOutline16，点击复制消息原文（clipboard，带成功反馈）。
     * 注意：复制键保持原始小尺寸（14px 图标），不随撤回/编辑的 1.3 倍放大。 */
    function CopyButton({ text }) {
      var L = useUILocaleDict();
      var copyState = React.useState(false);
      var copied = copyState[0];
      var setCopied = copyState[1];
      function copy() {
        var done = function () { setCopied(true); setTimeout(function () { setCopied(false); }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
        } else { legacyCopy(text); done(); }
      }
      return React.createElement("button", {
        type: "button",
        title: copied ? L.copied : L.copy,
        "aria-label": L.copy,
        style: {
          border: "none",
          background: "transparent",
          cursor: "pointer",
          width: 34,
          height: 34,
          padding: 0,
          borderRadius: "8px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center"
        },
        onMouseEnter: function (e) { e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))"; },
        onMouseLeave: function (e) { e.currentTarget.style.background = "transparent"; },
        onClick: function (e) { e.stopPropagation(); copy(); }
      }, copied
        ? React.createElement(IconCheckOutline, { size: 14 })
        : React.createElement(IconCopyOutline, { size: 14 }));
    }

    /** clipboard API 不可用时的回退复制。 */
    function legacyCopy(text) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
    }

export {
  extractText,
  contentParts,
  renderMessageImagesCompat,
  renderMessageAttachmentsCompat,
  FileCardView,
  formatFileSize,
  fileExtension,
  renderFileTypeIcon,
  iconImg,
  actionButton,
  pad2,
  formatClock,
  CopyButton,
  legacyCopy
};
