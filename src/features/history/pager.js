import * as React from "react";
import { IconChevronLeftOutline, IconChevronRightOutline } from "../../core/icons.js";
import { useUILocaleDict } from "../../core/i18n.js";
import { log } from "../../core/log.js";
import { serviceRefs, getUiWorkspace } from "../../core/services.js";
import { safeOpenSession } from "../recall/safe-session.js";
import { familyOfSession } from "../../core/session.js";
import { getChatSnapshot, hasChatSnapshot } from "../../core/constants.js";
import { extractText } from "../../core/ui.js";
import { readPending, writePending } from "../recall/store.js";
import { stageOutgoingFiles, stageBottomDraftFiles } from "../bubble/attachments.js";

    function goToVersion(fam, sessionId, nextIndex, props, cleanupRef) {
      var next = fam.versions[nextIndex];
      if (!next) return;
      log("info", "pager", "切换版本", { from: sessionId, to: next, index: nextIndex + 1, count: fam.versions.length });

      // 影子仓储保障：切换前自动备份当前会话物理快照
      try {
        fetch("/bubble/vault/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId, summary: "切换版本前自动保存" }),
          keepalive: true
        }).catch(function () {});
      } catch (eVs) {}

      var doOpen = function () {
        safeOpenSession(next, props);
        // 等当前会话确认为 next（轮询 current，不猜时间）后，将家族其余版本移入影子仓储，彻底不再调用 archiveSession 污染侧栏
        if (cleanupRef.current !== null) { clearInterval(cleanupRef.current); cleanupRef.current = null; }
        var attempts = 0;
        cleanupRef.current = setInterval(function () {
          attempts++;
          try {
            var cur = typeof props.currentSessionId === "function" ? props.currentSessionId() : null;
            if (cur === next) {
              clearInterval(cleanupRef.current);
              cleanupRef.current = null;
              fam.versions.forEach(function (vid) {
                if (vid !== next) {
                  fetch("/bubble/vault/retire-session", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ sessionId: vid }),
                    keepalive: true
                  }).catch(function () {});
                }
              });
              return;
            }
          } catch (e) { /* ignore */ }
          if (attempts >= 40) {
            clearInterval(cleanupRef.current);
            cleanupRef.current = null;
          }
        }, 200);
      };
      if (typeof props.restoreSession === "function") {
        try {
          props.restoreSession(next).then(function () { doOpen(); }, function () { doOpen(); });
          return;
        } catch (e) { /* fallthrough */ }
      }
      doOpen();
    }

    /** 该消息是否为会话第一条 user 消息（首条/截断会话首条无前置闭合边界）——模块级，UserBubbleView 与 RecallBanner 共用 */
    function isFirstUserMessage(props, myKey) {
      try {
        var snap = getChatSnapshot(props);
        if (snap && Array.isArray(snap.order) && snap.nodes && typeof snap.nodes.get === "function") {
          var ord = snap.order;
          for (var oi = 0; oi < ord.length; oi++) {
            var on = snap.nodes.get(ord[oi]);
            if (on && on.kind === "user") return on.key === myKey;
          }
        }
      } catch (e) { /* ignore */ }
      return false;
    }

    /** 在原会话所属的同一个工作区下创建全新空白子会话（用于首条消息无前置闭合边界时的撤回/重编辑）。
     * 优先使用 DSH 0.2 官方标准接口 ctxSessions.create({ workspaceId })，降级使用 getUiWorkspace().connectWorkspace(wsId)。
     */
    async function createBlankChildSession(sessionId, props) {
      var wsId = null;
      var cwd = null;
      try {
        if (props && props.ctxWorkspaces && typeof props.ctxWorkspaces.list === "object" && typeof props.ctxWorkspaces.list.getSnapshot === "function") {
          var wsList = props.ctxWorkspaces.list.getSnapshot();
          if (wsList && Array.isArray(wsList.items)) {
            for (var wi = 0; wi < wsList.items.length; wi++) {
              var wItem = wsList.items[wi];
              if (wItem && Array.isArray(wItem.sessionIds) && wItem.sessionIds.indexOf(sessionId) >= 0) {
                wsId = wItem.workspaceId;
                cwd = wItem.path || wItem.cwd || null;
                break;
              }
            }
          }
        }
      } catch (eWs) { /* ignore */ }

      try {
        if (!cwd && props && props.ctxSessions && typeof props.ctxSessions.list === "object" && typeof props.ctxSessions.list.getSnapshot === "function") {
          var sList = props.ctxSessions.list.getSnapshot();
          if (sList && Array.isArray(sList.items)) {
            for (var si = 0; si < sList.items.length; si++) {
              var sItem = sList.items[si];
              if (sItem && sItem.id === sessionId) {
                cwd = sItem.cwd || null;
                if (!wsId && sItem.workspaceId) wsId = sItem.workspaceId;
                break;
              }
            }
          }
        }
      } catch (eSess) { /* ignore */ }

      // 通道 1：DSH 0.2 SessionController.create({ workspaceId }) —— 铸造同工作区全新空白会话
      if (props && props.ctxSessions && typeof props.ctxSessions.create === "function") {
        try {
          var createOpts = wsId ? { workspaceId: wsId } : (cwd ? { cwd: cwd } : {});
          var createdId = await props.ctxSessions.create(createOpts);
          if (typeof createdId === "string" && createdId.length > 0) {
            log("info", "reset", "通过 ctxSessions.create 创建空白会话成功", { sessionId: sessionId, newId: createdId, wsId: wsId });
            return createdId;
          }
        } catch (eCreate) {
          log("warn", "reset", "ctxSessions.create 创建空白会话失败，尝试降级通道", { err: String(eCreate && eCreate.message ? eCreate.message : eCreate) });
        }
      }

      // 通道 2：uiWorkspace.connectWorkspace(wsId)
      var uiWs = getUiWorkspace();
      var wsConnector = (uiWs && typeof uiWs.connectWorkspace === "function")
        ? uiWs
        : ((props && props.ctxWorkspaces && typeof props.ctxWorkspaces.connectWorkspace === "function") ? props.ctxWorkspaces : null);
      if (wsId && wsConnector) {
        try {
          var connectedId = await wsConnector.connectWorkspace(wsId);
          if (typeof connectedId === "string" && connectedId.length > 0) {
            log("info", "reset", "通过 connectWorkspace 创建空白会话成功", { sessionId: sessionId, newId: connectedId, wsId: wsId });
            return connectedId;
          }
        } catch (eConn) {
          log("warn", "reset", "connectWorkspace 创建空白会话失败", { err: String(eConn && eConn.message ? eConn.message : eConn) });
        }
      }

      return null;
    }

    /** 极限场景重置（首条消息/截断会话首条，无前置闭合边界，无法 fork）：
     * 严格遵循「先保存快照 → 先创建并打开目标新会话 → 最后退役旧会话入影子仓储」时序，
     * 绝不在打开新会话前销毁当前会话（根治停留在 removed 死会话导致禁入红圈与文字重影）。
     * @param mode - "recall" | "edit"
     * @param text - edit 模式的修改后文本
     * @param props - 组件 inject 面
     */
    function resetConversation(sessionId, mode, text, props, imageIds, selOverride, stagedDraft, outgoingFiles, bottomFiles) {
      log("info", "reset", "首条消息重置对话", { sessionId: sessionId, mode: mode });
      var msel = selOverride || (props.modelSel ? props.modelSel.capture(sessionId) : null);
      writePending(sessionId, null);

      // 0) 预先保存当前会话完整快照入影子仓储
      try {
        fetch("/bubble/vault/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId, summary: "首条撤回前完整快照" }),
          keepalive: true
        }).catch(function () {});
      } catch (eSave) { /* ignore */ }

      // 辅助函数：打开目标会话成功后，再将原会话移入影子仓储并继承版本链
      function openTargetThenRetire(targetId) {
        if (!targetId) return false;
        if (mode === "edit" && typeof text === "string") {
          if (Array.isArray(outgoingFiles) && outgoingFiles.length > 0) {
            stageOutgoingFiles(targetId, outgoingFiles);
          }
          if (Array.isArray(bottomFiles) && bottomFiles.length > 0) {
            stageBottomDraftFiles(targetId, bottomFiles);
          }
          try {
            localStorage.setItem("dsh-easyrewrite:resume-send:" + targetId, JSON.stringify({
              draftText: text,
              t: Date.now(),
              imageIds: imageIds || [],
              sel: msel,
              stagedDraft: stagedDraft || null
            }));
          } catch (eLs) { /* ignore */ }
        }
        var opened = safeOpenSession(targetId, props);
        if (opened) {
          try {
            fetch("/bubble/vault/retire-session", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sessionId, replacementSessionId: targetId }),
              keepalive: true
            }).catch(function () {});
          } catch (eRet) { /* ignore */ }
        }
        return opened;
      }

      // 1) 场景 2：家族父版本（截断/分叉会话 → 回到上一次模型回复）
      try {
        var fam = familyOfSession(sessionId, props.ctxSessions);
        var parentId = fam && fam.versions.length >= 2 && fam.index > 0 ? fam.versions[fam.index - 1] : null;
        if (parentId) {
          var doOpenParent = function () {
            openTargetThenRetire(parentId);
          };
          if (typeof props.restoreSession === "function") {
            try { props.restoreSession(parentId).then(doOpenParent, doOpenParent); return; } catch (e) { /* fallthrough */ }
          }
          doOpenParent();
          return;
        }
      } catch (e) { /* ignore */ }

      // 2) 场景 1：全新会话首条 → 创建同工作区空白新会话，打开后再退役旧会话并继承版本链
      createBlankChildSession(sessionId, props).then(function (newId) {
        if (!newId) {
          log("warn", "reset", "空白新会话创建失败，保持当前会话可用");
          return;
        }
        openTargetThenRetire(newId);
      }).catch(function (err) {
        log("warn", "reset", "空白会话重置异常", { err: String(err && err.message ? err.message : err) });
      });
    }

    function goToVaultVersion(vaultManifest, sessionId, nextIndex, props, setVaultManifest, vaultManifestRef) {
      if (!vaultManifest || !Array.isArray(vaultManifest.versions)) return;
      var targetVer = vaultManifest.versions[nextIndex];
      if (!targetVer || typeof targetVer.versionNumber !== "number") return;
      log("info", "pager", "切换影子仓储版本", {
        sessionId: sessionId,
        targetVersionNumber: targetVer.versionNumber,
        index: nextIndex + 1,
        count: vaultManifest.versions.length
      });
      try {
        fetch("/bubble/vault/restore", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionId,
            targetVersionNumber: targetVer.versionNumber
          }),
          keepalive: true
        }).then(function (r) { return r.json(); }).then(function (data) {
          if (data && data.ok && data.manifest) {
            if (vaultManifestRef) vaultManifestRef.current = data.manifest;
            if (typeof setVaultManifest === "function") setVaultManifest(data.manifest);
            safeOpenSession(sessionId, props);
            if (typeof window !== "undefined" && window.location && typeof window.location.reload === "function") {
              setTimeout(function () { window.location.reload(); }, 60);
            }
          }
        }).catch(function (err) {
          log("warn", "pager", "影子仓储版本还原失败", { err: String(err && err.message ? err.message : err) });
        });
      } catch (e) {}
    }

    /** 版本翻页器 < X >：撤回/编辑重发产生的版本家族切换（官方 assistant-actions 操作区）。
     * 仅在该次问询的**最后一条 assistant 消息**（当前版本的回答）显示；点击 ‹/› 或键盘 ←/→
     * 切换版本（优先通过影子仓储 /bubble/vault/list & /restore 原位切换，回退支持兄弟会话切换）。 */
    function VersionPager(props) {
      var sessionId = (props && props.sessionId) || "";
      // —— hooks 无条件前置（React 规则：任何 return null 不得出现在 hooks 之前，否则 hook 数量漂移 → error #300）——
      var L = useUILocaleDict();
      var cleanupRef = React.useRef(null);
      var vaultState = React.useState(null);
      var vaultManifest = vaultState[0];
      var setVaultManifest = vaultState[1];
      var vaultManifestRef = React.useRef(null);
      var snapshot = getChatSnapshot(props);

      // 仅针对最后一个回合的助理回答/TurnTail 查询影子仓储版本清单
      var isLastTail = false;
      try {
        if (snapshot && Array.isArray(snapshot.order) && snapshot.nodes && typeof snapshot.nodes.get === "function") {
          var order = snapshot.order;
          for (var oi = order.length - 1; oi >= 0; oi--) {
            var nd = snapshot.nodes.get(order[oi]);
            if (nd && nd.kind === "turn-tail") {
              if (nd.data && nd.data.closing && nd.data.closing.finalNode) {
                isLastTail = nd.data.closing.finalNode.messageId === props.messageId;
              } else if (props && props.messageId) {
                isLastTail = (nd.messageId === props.messageId) || (nd.data && nd.data.messageId === props.messageId);
              }
              break;
            } else if (nd && (nd.kind === "assistant" || nd.kind === "bot")) {
              var mId = (nd.data && nd.data.messageId) || nd.messageId || nd.id;
              if (props && props.messageId && mId === props.messageId) {
                isLastTail = true;
                break;
              }
            }
          }
        } else {
          // 兜底：若无 snapshot 判定能力，默认为当前助理操作区
          isLastTail = true;
        }
      } catch (e) { /* ignore */ }

      React.useEffect(function () {
        if (!sessionId || !isLastTail || typeof fetch !== "function") return;
        var cancelled = false;
        var retryTimer = null;
        function fetchVaultList(attempt) {
          try {
            fetch("/bubble/vault/list", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: sessionId })
            }).then(function (r) { return r.json(); }).then(function (data) {
              if (cancelled) return;
              if (data && data.ok && data.manifest && Array.isArray(data.manifest.versions)) {
                if (data.manifest.versions.length >= 2) {
                  vaultManifestRef.current = data.manifest;
                  setVaultManifest(data.manifest);
                } else if (data.manifest.versions.length === 1 && attempt < 3) {
                  retryTimer = setTimeout(function () { fetchVaultList(attempt + 1); }, 350);
                }
              }
            }).catch(function () {});
          } catch (e) {}
        }
        fetchVaultList(0);
        return function () {
          cancelled = true;
          if (retryTimer !== null) clearTimeout(retryTimer);
        };
      }, [sessionId, isLastTail, props && props.messageId]);

      // 键盘 ←/→（输入框/可编辑区未聚焦时；实时读家族，避免陈旧闭包）
      React.useEffect(function () {
        function onKey(e) {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          var tgt = e.target;
          if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
          var vMan = vaultManifestRef.current;
          if (vMan && Array.isArray(vMan.versions) && vMan.versions.length >= 2) {
            var vIdx = typeof vMan.currentVersionIndex === "number" ? vMan.currentVersionIndex : vMan.versions.length - 1;
            if (e.key === "ArrowLeft" && vIdx > 0) { e.preventDefault(); goToVaultVersion(vMan, sessionId, vIdx - 1, props, setVaultManifest, vaultManifestRef); }
            else if (e.key === "ArrowRight" && vIdx < vMan.versions.length - 1) { e.preventDefault(); goToVaultVersion(vMan, sessionId, vIdx + 1, props, setVaultManifest, vaultManifestRef); }
            return;
          }
          var fam = familyOfSession(sessionId, props.ctxSessions);
          if (!fam || fam.versions.length < 2) return;
          var idx = fam.index;
          if (e.key === "ArrowLeft" && idx > 0) { e.preventDefault(); goToVersion(fam, sessionId, idx - 1, props, cleanupRef); }
          else if (e.key === "ArrowRight" && idx < fam.versions.length - 1) { e.preventDefault(); goToVersion(fam, sessionId, idx + 1, props, cleanupRef); }
        }
        window.addEventListener("keydown", onKey, true);
        return function () { window.removeEventListener("keydown", onKey, true); };
      }, [sessionId]);

      // —— 数据与显示条件（无 hooks，可安全 return null）——
      if (!isLastTail) return null;
      var useVault = !!(vaultManifest && Array.isArray(vaultManifest.versions) && vaultManifest.versions.length >= 2);
      var family = useVault ? null : familyOfSession(sessionId, props.ctxSessions);
      if (!useVault && (!family || family.versions.length < 2)) return null;

      var count = useVault ? vaultManifest.versions.length : family.versions.length;
      var index = useVault
        ? (typeof vaultManifest.currentVersionIndex === "number" ? vaultManifest.currentVersionIndex : count - 1)
        : family.index;
      var atFirst = index <= 0;
      var atLast = index >= count - 1;
      function go(delta) {
        if (useVault) {
          goToVaultVersion(vaultManifest, sessionId, index + delta, props, setVaultManifest, vaultManifestRef);
        } else {
          goToVersion(family, sessionId, index + delta, props, cleanupRef);
        }
      }
      var pagerStyle = {
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        fontSize: "14px",
        color: "var(--dsw-alias-label-tertiary)",
        fontVariantNumeric: "tabular-nums"
      };
      var btnStyle = {
        appearance: "none",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: "var(--dsw-alias-label-secondary)",
        padding: "3px 7px",
        borderRadius: "6px",
        fontSize: "15px",
        lineHeight: "19px",
        fontFamily: "inherit"
      };
      function btnDisabled(flag) { return Object.assign({}, btnStyle, flag ? { opacity: 0.35, cursor: "default" } : {}); }
      return React.createElement("span", { style: pagerStyle, "data-dsh-easyrewrite": "version-pager", title: L.pagerTitle },
        React.createElement("button", {
          type: "button",
          className: "dbe-pager-btn",
          style: btnDisabled(atFirst),
          disabled: atFirst,
          "aria-label": L.pagerPrev,
          onClick: function () { go(-1); }
        }, React.createElement(IconChevronLeftOutline, null)),
        React.createElement("span", { style: { padding: "0 4px", fontSize: "14px", whiteSpace: "nowrap" } }, (index + 1) + "/" + count),
        React.createElement("button", {
          type: "button",
          className: "dbe-pager-btn",
          style: btnDisabled(atLast),
          disabled: atLast,
          "aria-label": L.pagerNext,
          onClick: function () { go(1); }
        }, React.createElement(IconChevronRightOutline, null))
      );
    }


export { goToVersion, isFirstUserMessage, createBlankChildSession, resetConversation, VersionPager };
