import * as React from "react";
import { IconChevronLeftOutline, IconChevronRightOutline } from "../../core/icons.js";
import { useUILocaleDict } from "../../core/i18n.js";
import { log } from "../../core/log.js";
import { serviceRefs, getUiWorkspace } from "../../core/services.js";
import { safeOpenSession } from "../recall/safe-session.js";
import { familyOfSession } from "../../core/session.js";
import { getChatSnapshot, hasChatSnapshot, pagerEnabled, pagerConfirmEnabled } from "../../core/constants.js";
import { renderWithChatGate } from "../../core/hook-gates.js";
import { extractText } from "../../core/ui.js";
import { readPending, writePending } from "../recall/store.js";
import { stageOutgoingFiles, stageBottomDraftFiles } from "../bubble/attachments.js";

    function fmtShortVerTime(ts) {
      if (!ts || typeof ts !== "number" || isNaN(ts)) return "";
      try {
        var d = new Date(ts);
        var p = function (n) { return n < 10 ? "0" + n : String(n); };
        return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
      } catch (e) {
        return "";
      }
    }

    function goToVersion(fam, sessionId, nextIndex, props) {
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

      // 安全打开目标兄弟会话，严禁调用会话退役接口将原主会话或原生 Fork 分支从侧栏删除（Issue #28 / dsh-sidenote 保护）
      var doOpen = function () {
        safeOpenSession(next, props);
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
     * 仅在该次问询的**最后一条 assistant 消息**（当前版本的回答）显示；点击 ‹/› 切换版本
     * （支持内联确认胶囊、历史版本状态提示与一键回到最新；已移除全局裸方向键监听以防误触）。 */
    function VersionPager(props) {
      return renderWithChatGate(VersionPagerBody, props);
    }

    function VersionPagerBody(props) {
      var sessionId = (props && props.sessionId) || "";
      // —— hooks 无条件前置（React 规则：任何 return null 不得出现在 hooks 之前，否则 hook 数量漂移 → error #300）——
      var L = useUILocaleDict();
      var vaultState = React.useState(null);
      var vaultManifest = vaultState[0];
      var setVaultManifest = vaultState[1];
      var vaultManifestRef = React.useRef(null);
      var pagerOnState = React.useState(pagerEnabled());
      var pagerOn = pagerOnState[0];
      var setPagerOn = pagerOnState[1];
      var pendingState = React.useState(null);
      var pendingTargetIndex = pendingState[0];
      var setPendingTargetIndex = pendingState[1];
      var snapshot = getChatSnapshot(props);

      // 监听设置变更，实时同步 pagerEnabled 开关状态
      React.useEffect(function () {
        function syncPagerSetting() {
          setPagerOn(pagerEnabled());
        }
        window.addEventListener("dsh-easyrewrite:settings-change", syncPagerSetting);
        window.addEventListener("storage", syncPagerSetting);
        return function () {
          window.removeEventListener("dsh-easyrewrite:settings-change", syncPagerSetting);
          window.removeEventListener("storage", syncPagerSetting);
        };
      }, []);

      // 切换会话时重置待确认的目标版本索引
      React.useEffect(function () {
        setPendingTargetIndex(null);
      }, [sessionId]);

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
        if (!pagerOn || !sessionId || !isLastTail || typeof fetch !== "function") return;
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
      }, [pagerOn, sessionId, isLastTail, props && props.messageId]);

      // —— 数据与显示条件（无 hooks，可安全 return null）——
      if (!pagerOn || !isLastTail) return null;
      var useVault = !!(vaultManifest && Array.isArray(vaultManifest.versions) && vaultManifest.versions.length >= 2);
      var family = useVault ? null : familyOfSession(sessionId, props.ctxSessions);
      if (!useVault && (!family || family.versions.length < 2)) return null;

      var count = useVault ? vaultManifest.versions.length : family.versions.length;
      var index = useVault
        ? (typeof vaultManifest.currentVersionIndex === "number" ? vaultManifest.currentVersionIndex : count - 1)
        : family.index;
      var atFirst = index <= 0;
      var atLast = index >= count - 1;
      var isHistorical = index < count - 1;

      function executeGo(targetIdx) {
        if (targetIdx < 0 || targetIdx >= count || targetIdx === index) return;
        setPendingTargetIndex(null);
        if (useVault) {
          goToVaultVersion(vaultManifest, sessionId, targetIdx, props, setVaultManifest, vaultManifestRef);
        } else {
          goToVersion(family, sessionId, targetIdx, props);
        }
      }

      function requestGo(targetIdx) {
        if (targetIdx < 0 || targetIdx >= count || targetIdx === index) return;
        if (pagerConfirmEnabled()) {
          setPendingTargetIndex(targetIdx);
        } else {
          executeGo(targetIdx);
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

      function formatVersionTag(idxPos) {
        var verItem = useVault && vaultManifest && Array.isArray(vaultManifest.versions) ? vaultManifest.versions[idxPos] : null;
        var num = verItem && typeof verItem.versionNumber === "number" ? verItem.versionNumber : (idxPos + 1);
        var ts = verItem ? (verItem.updatedAt || verItem.createdAt) : null;
        var shortTime = ts ? fmtShortVerTime(ts) : "";
        return shortTime ? String(num) + " (" + shortTime + ")" : String(num);
      }

      return React.createElement("span", { style: pagerStyle, "data-dsh-easyrewrite": "version-pager", title: L.pagerTitle },
        React.createElement("button", {
          type: "button",
          className: "dbe-pager-btn",
          style: btnDisabled(atFirst),
          disabled: atFirst,
          "aria-label": L.pagerPrev,
          onClick: function () { requestGo(index - 1); }
        }, React.createElement(IconChevronLeftOutline, null)),
        React.createElement("span", { style: { padding: "0 4px", fontSize: "14px", whiteSpace: "nowrap" } }, (index + 1) + "/" + count),
        React.createElement("button", {
          type: "button",
          className: "dbe-pager-btn",
          style: btnDisabled(atLast),
          disabled: atLast,
          "aria-label": L.pagerNext,
          onClick: function () { requestGo(index + 1); }
        }, React.createElement(IconChevronRightOutline, null)),
        pendingTargetIndex !== null ? React.createElement("span", {
          "data-dsh-easyrewrite": "pager-confirm-capsule",
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            marginLeft: "6px",
            padding: "2px 8px",
            borderRadius: "999px",
            background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.14))",
            border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.28))",
            fontSize: "12px",
            color: "var(--dsw-alias-label-primary)",
            whiteSpace: "nowrap"
          }
        },
          React.createElement("span", null, (L.pagerSwitchAsk || "切至 v{ver}？").replace("{ver}", formatVersionTag(pendingTargetIndex))),
          React.createElement("button", {
            type: "button",
            style: {
              appearance: "none",
              border: "none",
              background: "var(--dsw-static-deepseek-500, #4d6bfe)",
              color: "#ffffff",
              borderRadius: "999px",
              padding: "1px 8px",
              fontSize: "11px",
              cursor: "pointer",
              fontFamily: "inherit"
            },
            onClick: function () { executeGo(pendingTargetIndex); }
          }, L.confirm || "确定"),
          React.createElement("button", {
            type: "button",
            style: {
              appearance: "none",
              border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
              background: "transparent",
              color: "var(--dsw-alias-label-secondary)",
              borderRadius: "999px",
              padding: "1px 8px",
              fontSize: "11px",
              cursor: "pointer",
              fontFamily: "inherit"
            },
            onClick: function () { setPendingTargetIndex(null); }
          }, L.cancel || "取消")
        ) : (isHistorical ? React.createElement("span", {
          "data-dsh-easyrewrite": "pager-historical-badge",
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            marginLeft: "6px",
            padding: "2px 8px",
            borderRadius: "999px",
            background: "rgba(217, 130, 43, 0.14)",
            border: "1px solid rgba(217, 130, 43, 0.35)",
            fontSize: "11px",
            color: "#d9822b",
            whiteSpace: "nowrap"
          }
        },
          React.createElement("span", null, (L.pagerHistoricalBadge || "历史版本 v{cur}（最新 v{max}）").replace("{cur}", formatVersionTag(index)).replace("{max}", formatVersionTag(count - 1))),
          React.createElement("button", {
            type: "button",
            style: {
              appearance: "none",
              border: "none",
              background: "rgba(217, 130, 43, 0.22)",
              color: "inherit",
              borderRadius: "999px",
              padding: "1px 7px",
              fontSize: "11px",
              fontWeight: "600",
              cursor: "pointer",
              fontFamily: "inherit"
            },
            onClick: function () { requestGo(count - 1); }
          }, L.pagerBackToLatest || "回到最新")
        ) : null)
      );
    }


export { goToVersion, isFirstUserMessage, createBlankChildSession, resetConversation, VersionPager };
