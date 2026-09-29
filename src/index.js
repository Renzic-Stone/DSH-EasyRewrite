import * as React from "react";
import { setServiceRefs } from "./core/services.js";
import { setLocaleService } from "./core/i18n.js";
import { log } from "./core/log.js";
import { NS } from "./core/constants.js";
import { invokeOpenSession } from "./core/session.js";
import { BundleConfigPage, initAutoUpdateCheck } from "./features/bundle-config/index.js";
import { registerBubble } from "./features/bubble/index.js";
import { registerRecall } from "./features/recall/index.js";
import { registerHistory } from "./features/history/index.js";
import { registerOther } from "./features/other/index.js";
import { EasyRewriteSettingsCard } from "./features/settings-card/index.js";

function apply(ctx) {
  ctx.effect(() => {
    const disposers = [];

    function safeRun(tag, fn) {
      try {
        log("info", "boot-step", "start: " + tag);
        const res = fn();
        log("info", "boot-step", "ok: " + tag);
        return res;
      } catch (err) {
        const msg = (err && err.stack) || (err && err.message) || String(err);
        log("error", "boot-step", "FAIL [" + tag + "]: " + msg);
        try { console.error("[dsh-easyrewrite] Boot step " + tag + " crashed:", err); } catch (e) {}
        return null;
      }
    }

    // 0. 初始化全局上下文与服务弱引用
    safeRun("services-init", () => {
      setServiceRefs(ctx);
      if (ctx && ctx.locale) setLocaleService(ctx.locale);
      try {
        if (typeof ctx.locale === "object" && ctx.locale !== null && typeof ctx.locale.register === "function") {
          ctx.locale.register(NS, {});
        }
      } catch (e) {}
    });

    log("info", "lifecycle", "client half active (v3.0.0 modular architecture)");

    // 每日自动检测更新静默触发
    safeRun("auto-update", () => {
      initAutoUpdateCheck();
    });

    // 注入插件卡片与组件行视觉优化样式（组件标识统一规范为 DSH-EasyRewrite/<Part>）
    safeRun("row-labels-polish", () => {
      try {
        const styleId = "dsh-easyrewrite-row-polish";
        if (typeof document !== "undefined" && !document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = `
            [data-plugin-package="dsh-easyrewrite"] img,
            [data-plugin-detail="dsh-easyrewrite"] img,
            [data-plugin-item="dsh-easyrewrite"] img {
              width: 44px !important;
              height: 44px !important;
              max-width: 44px !important;
              max-height: 44px !important;
              object-fit: contain;
            }

            /* 组件列表行：隐藏全小写短 ID，美化模块路径为规范品牌大写格式 */
            [data-plugin-row="bubble"] code:nth-of-type(1) { display: none !important; }
            [data-plugin-row="bubble"] code:nth-of-type(2) { font-size: 0 !important; }
            [data-plugin-row="bubble"] code:nth-of-type(2)::after {
              content: "DSH-EasyRewrite/Bubble";
              font-size: 11.5px;
            }

            [data-plugin-row="recall"] code:nth-of-type(1) { display: none !important; }
            [data-plugin-row="recall"] code:nth-of-type(2) { font-size: 0 !important; }
            [data-plugin-row="recall"] code:nth-of-type(2)::after {
              content: "DSH-EasyRewrite/Recall";
              font-size: 11.5px;
            }

            [data-plugin-row="history"] code:nth-of-type(1) { display: none !important; }
            [data-plugin-row="history"] code:nth-of-type(2) { font-size: 0 !important; }
            [data-plugin-row="history"] code:nth-of-type(2)::after {
              content: "DSH-EasyRewrite/History";
              font-size: 11.5px;
            }

            [data-plugin-row="other"] code:nth-of-type(1) { display: none !important; }
            [data-plugin-row="other"] code:nth-of-type(2) { font-size: 0 !important; }
            [data-plugin-row="other"] code:nth-of-type(2)::after {
              content: "DSH-EasyRewrite/Other";
              font-size: 11.5px;
            }

            /* 组件详情页：同样规范化显示 */
            [data-plugin-row-detail="dsh-easyrewrite#bubble"] [class*="detailName"]:nth-of-type(1) { display: none !important; }
            [data-plugin-row-detail="dsh-easyrewrite#bubble"] [class*="detailName"]:nth-of-type(2) code { font-size: 0 !important; }
            [data-plugin-row-detail="dsh-easyrewrite#bubble"] [class*="detailName"]:nth-of-type(2) code::after {
              content: "DSH-EasyRewrite/Bubble";
              font-size: 12px;
            }

            [data-plugin-row-detail="dsh-easyrewrite#recall"] [class*="detailName"]:nth-of-type(1) { display: none !important; }
            [data-plugin-row-detail="dsh-easyrewrite#recall"] [class*="detailName"]:nth-of-type(2) code { font-size: 0 !important; }
            [data-plugin-row-detail="dsh-easyrewrite#recall"] [class*="detailName"]:nth-of-type(2) code::after {
              content: "DSH-EasyRewrite/Recall";
              font-size: 12px;
            }

            [data-plugin-row-detail="dsh-easyrewrite#history"] [class*="detailName"]:nth-of-type(1) { display: none !important; }
            [data-plugin-row-detail="dsh-easyrewrite#history"] [class*="detailName"]:nth-of-type(2) code { font-size: 0 !important; }
            [data-plugin-row-detail="dsh-easyrewrite#history"] [class*="detailName"]:nth-of-type(2) code::after {
              content: "DSH-EasyRewrite/History";
              font-size: 12px;
            }

            [data-plugin-row-detail="dsh-easyrewrite#other"] [class*="detailName"]:nth-of-type(1) { display: none !important; }
            [data-plugin-row-detail="dsh-easyrewrite#other"] [class*="detailName"]:nth-of-type(2) code { font-size: 0 !important; }
            [data-plugin-row-detail="dsh-easyrewrite#other"] [class*="detailName"]:nth-of-type(2) code::after {
              content: "DSH-EasyRewrite/Other";
              font-size: 12px;
            }
          `;
          document.head.appendChild(style);
          disposers.push(() => {
            try { style.remove(); } catch (e) {}
          });
        }

        // JS 运行时 DOM 增强：秒级捕获并保证文本替换与短 ID 隐藏
        if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
          const TARGETS = {
            "dsh-easyrewrite/bubble": "DSH-EasyRewrite/Bubble",
            "dsh-easyrewrite/recall": "DSH-EasyRewrite/Recall",
            "dsh-easyrewrite/history": "DSH-EasyRewrite/History",
            "dsh-easyrewrite/other": "DSH-EasyRewrite/Other"
          };
          const cleanCodes = () => {
            try {
              const codeEls = document.querySelectorAll("code");
              for (let i = 0; i < codeEls.length; i++) {
                const el = codeEls[i];
                const text = (el.textContent || "").trim();
                const matched = TARGETS[text];
                if (matched) {
                  el.textContent = matched;
                  let prev = el.previousElementSibling;
                  while (prev) {
                    if (prev.tagName === "CODE") {
                      prev.style.display = "none";
                      break;
                    }
                    prev = prev.previousElementSibling;
                  }
                }
              }
            } catch (err) {}
          };
          cleanCodes();
          const obs = new MutationObserver(() => cleanCodes());
          if (document.body) {
            obs.observe(document.body, { childList: true, subtree: true });
            disposers.push(() => {
              try { obs.disconnect(); } catch (e) {}
            });
          }
        }
      } catch (e) {}
    });

    // 1. 注册顶级包配置（plugins.bundle.config）
    safeRun("bundle-config", () => {
      if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
        const dBnd = ctx.slots.inject("plugins.bundle.config", () =>
          ctx.slots.register(
            { name: "plugins.bundle.config", key: "dsh-easyrewrite" },
            BundleConfigPage
          )
        );
        if (typeof dBnd === "function") disposers.push(dBnd);
      }
    });

    // 2. 按功能注册四大 Row 组件（各自包含独立的 Slot 注入与卸载 Disposer）
    safeRun("register-bubble", () => {
      const dBubble = registerBubble(ctx);
      if (typeof dBubble === "function") disposers.push(dBubble);
    });

    safeRun("register-recall", () => {
      const dRecall = registerRecall(ctx);
      if (typeof dRecall === "function") disposers.push(dRecall);
    });

    safeRun("register-history", () => {
      const dHistory = registerHistory(ctx);
      if (typeof dHistory === "function") disposers.push(dHistory);
    });

    safeRun("register-other", () => {
      const dOther = registerOther(ctx);
      if (typeof dOther === "function") disposers.push(dOther);
    });

    // 3. 兼容注册老版本 settings.plugin.item 与单 row 时的 plugins.row.config 综合卡片
    safeRun("compat-cards", () => {
      if (ctx && ctx.slots && typeof ctx.slots.inject === "function") {
        function registerCard(slotName, kind, embedded) {
          return ctx.slots.inject(slotName, () =>
            ctx.slots.register(Object.assign({
              name: slotName,
              inject: () => ({
                openSession: (id) => invokeOpenSession(ctx, id),
                ctxWorkspaces: ctx.workspaces,
                ctxSessions: ctx.sessions
              })
            }, kind), EasyRewriteSettingsCard)
          );
        }
        const dCard1 = registerCard("settings.plugin.item", { key: "dsh-easyrewrite" });
        if (typeof dCard1 === "function") disposers.push(dCard1);
        const dCard2 = registerCard("plugins.row.config", { key: "dsh-easyrewrite#dsh-easyrewrite" }, true);
        if (typeof dCard2 === "function") disposers.push(dCard2);
      }
    });

    return () => {
      for (let i = 0; i < disposers.length; i++) {
        try {
          if (typeof disposers[i] === "function") disposers[i]();
        } catch (e) {}
      }
      log("info", "lifecycle", "client half unloaded");
    };
  }, "dsh-easyrewrite: modular client bundle");
}

export default {
  name: "dsh-easyrewrite",
  inject: ["slots", "sessions", "workspaces", "conversation", "locale", "modelDirectories"],
  apply
};
