import * as React from "react";
import { IconChevronLeftOutline, IconChevronRightOutline } from "../../core/icons.js";
import { useUILocaleDict } from "../../core/i18n.js";
import { log } from "../../core/log.js";
import { serviceRefs } from "../../core/services.js";
import { safeOpenSession } from "../recall/safe-session.js";
import { familyOfSession } from "../../core/session.js";
import { getChatSnapshot, hasChatSnapshot } from "../../core/constants.js";
import { extractText } from "../../core/ui.js";
import { readPending, writePending } from "../recall/store.js";

    function goToVersion(fam, sessionId, nextIndex, props, cleanupRef) {
      var next = fam.versions[nextIndex];
      if (!next) return;
      log("info", "pager", "切换版本", { from: sessionId, to: next, index: nextIndex + 1, count: fam.versions.length });
      // 历史版本都是归档会话（无痕替换副作用），先恢复再打开；恢复失败也照常打开（幂等）
      var doOpen = function () {
        safeOpenSession(next, props);
        // 等当前会话确认为 next（轮询 current，不猜时间）后，归档家族其余版本——列表只保留目标一个。
        // open 未确认（超时 8s）则放弃归档，绝不误伤任何会话。
        if (cleanupRef.current !== null) { clearInterval(cleanupRef.current); cleanupRef.current = null; }
        var attempts = 0;
        cleanupRef.current = setInterval(function () {
          attempts++;
          try {
            var cur = typeof props.currentSessionId === "function" ? props.currentSessionId() : null;
            if (cur === next) {
              clearInterval(cleanupRef.current);
              cleanupRef.current = null;
              if (typeof props.archiveSession === "function") {
                fam.versions.forEach(function (vid) {
                  if (vid !== next) props.archiveSession(vid);
                });
              }
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

    /** 极限场景重置（首条消息/截断会话首条，无前置闭合边界，无法 fork）：
     * - 家族会话（截断/分叉产物，版本 ≥2）：归档当前 → 恢复并打开**父版本**（上一次模型回复处）重新开始；
     *   编辑模式经 resume 机制把修改文本带到父版本自动重发。
     * - 全新会话首条（无家族）：归档当前 → 回到空白新对话（官方 project() 检测归档即回 hero）。
     * @param mode - "recall" | "edit"
     * @param text - edit 模式的修改后文本
     * @param props - 组件 inject 面
     */
    function resetConversation(sessionId, mode, text, props, imageIds, selOverride, stagedDraft) {
      log("info", "reset", "首条消息重置对话", { sessionId: sessionId, mode: mode });
      // v2.1.1：目标会话（父版本或空白新会话）发送前需要恢复当前模型/挡位
      // v2.2：气泡编辑 chip 的本地选择优先（selOverride），撤回键路径不传 → 原语义
      var msel = selOverride || (props.modelSel ? props.modelSel.capture(sessionId) : null);
      writePending(sessionId, null);
      // 1) 归档当前会话（两种场景都需要；project() 检测 current 归档 → 自动回 hero/父版本打开后列表更新）
      try {
        var archiver = typeof props.archiveSession === "function"
          ? props.archiveSession
          : (props.ctxWorkspaces && typeof props.ctxWorkspaces.archiveSession === "function"
            ? function (id) { return props.ctxWorkspaces.archiveSession(id); }
            : null);
        if (archiver) {
          Promise.resolve(archiver(sessionId)).catch(function () { log("warn", "reset", "归档失败", { sessionId: sessionId }); });
        } else {
          log("warn", "reset", "归档能力不可用", { sessionId: sessionId });
        }
      } catch (e) { /* ignore */ }
      // 2) 场景 2：家族父版本（截断/分叉会话 → 回到上一次模型回复）
      try {
        var fam = familyOfSession(sessionId, props.ctxSessions);
        log("info", "reset", "场景2家族判定", { sessionId: sessionId, found: !!fam, verLen: fam ? fam.versions.length : -1, index: fam ? fam.index : -1 });
        var parentId = fam && fam.versions.length >= 2 && fam.index > 0 ? fam.versions[fam.index - 1] : null;
        if (parentId) {
          if (mode === "edit" && typeof text === "string") {
            try { localStorage.setItem("dsh-easyrewrite:resume-send:" + parentId, JSON.stringify({ draftText: text, t: Date.now(), imageIds: imageIds || [], sel: msel, stagedDraft: stagedDraft || null })); } catch (e) { /* ignore */ }
          }
          var doOpenParent = function () {
            safeOpenSession(parentId, props);
          };
          if (typeof props.restoreSession === "function") {
            try { props.restoreSession(parentId).then(doOpenParent, doOpenParent); return; } catch (e) { /* fallthrough */ }
          }
          doOpenParent();
          return;
        }
      } catch (e) { /* ignore */ }
      // 3) 场景 1：全新会话首条 → 无缝打开空白新会话（编辑模式经 resume 自动发送编辑文本）
      try {
        var wsId = null;
        if (props.ctxWorkspaces && typeof props.ctxWorkspaces.list === "object" && typeof props.ctxWorkspaces.list.getSnapshot === "function") {
          var wsList = props.ctxWorkspaces.list.getSnapshot();
          if (wsList && Array.isArray(wsList.items)) {
            for (var wi = 0; wi < wsList.items.length; wi++) {
              if (wsList.items[wi] && Array.isArray(wsList.items[wi].sessionIds) && wsList.items[wi].sessionIds.indexOf(sessionId) >= 0) {
                wsId = wsList.items[wi].workspaceId;
                break;
              }
            }
          }
        }
          log("info", "reset", "场景1工作区定位", { sessionId: sessionId, wsId: wsId, hasConnect: !!(props.ctxWorkspaces && typeof props.ctxWorkspaces.connectWorkspace === "function") });
        var wsConnector = (serviceRefs.uiWorkspace && typeof serviceRefs.uiWorkspace.connectWorkspace === "function") ? serviceRefs.uiWorkspace : ((props.ctxWorkspaces && typeof props.ctxWorkspaces.connectWorkspace === "function") ? props.ctxWorkspaces : null);
        if (wsId && wsConnector) {
          wsConnector.connectWorkspace(wsId).then(function (newId) {
            if (!newId) return;
            if (mode === "edit" && typeof text === "string") {
              try { localStorage.setItem("dsh-easyrewrite:resume-send:" + newId, JSON.stringify({ draftText: text, t: Date.now(), imageIds: imageIds || [], sel: msel, stagedDraft: stagedDraft || null })); } catch (e) { /* ignore */ }
            }
            log("info", "reset", "空白新会话已就绪", { newId: newId, mode: mode });
            safeOpenSession(newId, props);
          }).catch(function () { log("warn", "reset", "空白会话创建失败（回 hero）"); });
          return;
        }
      } catch (e) { /* ignore */ }
      // 兜底：归档已生效，官方自动回 hero
      log("info", "reset", "重置完成（兜底路径）", { sessionId: sessionId, mode: mode });
    }

    /** 版本翻页器 < X >：撤回/编辑重发产生的版本家族切换（官方 assistant-actions 操作区）。
     * 仅在该次问询的**最后一条 assistant 消息**（当前版本的回答）显示；点击 ‹/› 或键盘 ←/→
     * 切换版本（sessions.open 兄弟会话），切换后滚动锚定保持文本位置不动。 */
    function VersionPager(props) {
      var sessionId = props.sessionId;
      // —— hooks 无条件前置（React 规则：任何 return null 不得出现在 hooks 之前，否则 hook 数量漂移 → error #300）——
      var L = useUILocaleDict();
      var cleanupRef = React.useRef(null);
      // 注意：没有卸载清理！切换会卸载组件——卸载时绝不能清掉未执行的归档定时器
      //（归档必须在切换后照常执行；竞态防护只在 goToVersion 内 clear 前一次的）
      // 键盘 ←/→（输入框/可编辑区未聚焦时；实时读家族，避免陈旧闭包）
      React.useEffect(function () {
        function onKey(e) {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          var tgt = e.target;
          if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
          var fam = familyOfSession(sessionId, props.ctxSessions);
          if (!fam || fam.versions.length < 2) return;
          var idx = fam.index;
          if (e.key === "ArrowLeft" && idx > 0) { e.preventDefault(); goToVersion(fam, sessionId, idx - 1, props, cleanupRef); }
          else if (e.key === "ArrowRight" && idx < fam.versions.length - 1) { e.preventDefault(); goToVersion(fam, sessionId, idx + 1, props, cleanupRef); }
        }
        window.addEventListener("keydown", onKey, true);
        return function () { window.removeEventListener("keydown", onKey, true); };
      }, []);
      // —— 数据与显示条件（无 hooks，可安全 return null）——
      var family = familyOfSession(sessionId, props.ctxSessions);
      if (!family || family.versions.length < 2) return null;
      // 只挂在**会话最后一个回合**的 TurnTail 上（历史回合的 TurnTail 也渲染本槽，须排除）：
      // order 最后一项是 turn-tail 且其 data.closing.finalNode.messageId == 本组件的 messageId
      var isLastTail = false;
      try {
        var snapshot = getChatSnapshot(props);
        if (snapshot && Array.isArray(snapshot.order) && snapshot.nodes && typeof snapshot.nodes.get === "function") {
          var order = snapshot.order;
          if (order.length > 0) {
            var tt = snapshot.nodes.get(order[order.length - 1]);
            if (tt && tt.kind === "turn-tail" && tt.data && tt.data.closing && tt.data.closing.finalNode) {
              isLastTail = tt.data.closing.finalNode.messageId === props.messageId;
            }
          }
        }
      } catch (e) { /* ignore */ }
      if (!isLastTail) return null;
      var index = family.index;
      var count = family.versions.length;
      var atFirst = index <= 0;
      var atLast = index >= count - 1;
      function go(delta) {
        goToVersion(family, sessionId, index + delta, props, cleanupRef);
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


export { goToVersion, isFirstUserMessage, resetConversation, VersionPager };
