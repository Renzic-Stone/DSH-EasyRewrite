import * as React from "react";
import { IconCheckOutline } from "../../core/icons.js";
import { useUILocaleDict } from "../../core/i18n.js";
import {
  CURRENT_VERSION,
  MIN_DSH_VERSION,
  MAX_TESTED_DSH_VERSION,
  cmpDsh,
  versionGt,
  getBool,
  setBool,
  getSetting,
  setSetting,
  rewriteOnClick,
  editOffShowRecall,
  recallConfirmEnabled,
  recallVisualMode,
  draftConflictMode,
  showOriginalImages
} from "../../core/constants.js";
import { editWidthMode, editWidthCustom } from "../bubble/width.js";
import {
  hotkeySetting,
  setHotkeySetting,
  hotkeyEnabledSetting,
  setHotkeyEnabledSetting,
  hotkeyCaptureActive,
  setHotkeyCaptureActive,
  keydownCombo,
  formatHotkey
} from "../recall/hotkey.js";
import { countContentAfter, statOnlyUser } from "../other/helpers.js";
import { listVersionFamilies } from "../../core/session.js";
import { legacyCopy } from "../../core/ui.js";

    function EasyRewriteSettingsCard(props) {
      /**
       * 是否由外部容器提供卡片外壳。
       *
       * 0.1.7 的插件页（plugins.item）自己画行外壳、标题取自插槽 label，卡片再画一层头部
       * 就成了嵌套折叠；旧插槽 settings.plugin.item 没有外壳，卡片必须自画。由挂载方经
       * inject 面传入，默认 false，保持旧行为。
       */
      var embedded = !!(props && props.embedded);
      var L = useUILocaleDict();
      // embedded 时头部不渲染，但「展开时检查更新」这类 side effect 仍要照跑，故初始即展开。
      var openState = React.useState(embedded);
      var open = openState[0];
      var setOpen = openState[1];
      // 控件状态（初始化自 localStorage）
      var sRewrite = React.useState(rewriteOnClick());
      var rewrite = sRewrite[0];
      var setRewrite = sRewrite[1];
      var sRecall = React.useState(editOffShowRecall());
      var showRecall = sRecall[0];
      var setShowRecall = sRecall[1];
      var sConfirm = React.useState(recallConfirmEnabled());
      var confirmCapsule = sConfirm[0];
      var setConfirmCapsule = sConfirm[1];
      // —— 更新状态（检查/执行；每日检测开关默认关） ——
        // —— 版本历史三层折叠（review 后新增）：总开关默认收起；各家族默认收起 ——
        var sHistOpen = React.useState(false);
        var histOpen = sHistOpen[0];
        var setHistOpen = sHistOpen[1];
        var sFamOpen = React.useState({});
        var famOpenMap = sFamOpen[0];
        var setFamOpenMap = sFamOpen[1];
      var sUpdateVer = React.useState("");
      var updateVer = sUpdateVer[0];
      var setUpdateVer = sUpdateVer[1];
      var sDshVer = React.useState(null);
      var dshVer = sDshVer[0];
      var setDshVer = sDshVer[1];
      var sRemindClosed = React.useState(getBool("dsh-easyrewrite:autoCheckReminded", false));
      var remindClosed = sRemindClosed[0];
      var setRemindClosed = sRemindClosed[1];
      var sUpdateMsg = React.useState("");
      var updateMsg = sUpdateMsg[0];
      var setUpdateMsg = sUpdateMsg[1];
      var sUpdateAvail = React.useState("");
      var updateAvailableVer = sUpdateAvail[0];
      var setUpdateAvailableVer = sUpdateAvail[1];
      var sChecking = React.useState(false);
      var updateChecking = sChecking[0];
      var setUpdateChecking = sChecking[1];
      var sUpdating = React.useState(false);
      var updateUpdating = sUpdating[0];
      var setUpdateUpdating = sUpdating[1];
      var sAutoCheck = React.useState(getBool("dsh-easyrewrite:autoCheckUpdate", false));
      var autoCheckOn = sAutoCheck[0];
      var setAutoCheckOn = sAutoCheck[1];
      function doCheckUpdate() {
        setUpdateChecking(true);
        setUpdateMsg("");
        fetch("/bubble/check-update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
          keepalive: true
        }).then(function (r) { return r.json(); }).then(function (d) {
          setUpdateChecking(false);
          if (!d || !d.ok) { setUpdateMsg(L.updateFailed); return; }
          setUpdateVer(d.current || "?");
          setDshVer(typeof d.dshVersion === "string" ? d.dshVersion : null);
          if (d.latest && versionGt(d.latest, d.current || "0")) {
            setUpdateAvailableVer(d.latest);
            try { localStorage.setItem("dsh-easyrewrite:updateAvailable", "1"); } catch (e) { /* ignore */ }
          } else {
            setUpdateAvailableVer("");
            setUpdateMsg(L.upToDate);
            try { localStorage.removeItem("dsh-easyrewrite:updateAvailable"); } catch (e) { /* ignore */ }
          }
        }).catch(function () { setUpdateChecking(false); setUpdateMsg(L.updateFailed); });
      }
      function doUpdatePlugin() {
        if (!updateAvailableVer) return;
        setUpdateUpdating(true);
        fetch("/bubble/update-plugin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
          keepalive: true
        }).then(function (r) { return r.json(); }).then(function (d) {
          setUpdateUpdating(false);
          if (d && d.ok) {
            setUpdateMsg(L.updateDone);
            setUpdateAvailableVer("");
            try { localStorage.removeItem("dsh-easyrewrite:updateAvailable"); } catch (e) { /* ignore */ }
          } else {
            setUpdateMsg(L.updateFailed);
          }
        }).catch(function () { setUpdateUpdating(false); setUpdateMsg(L.updateFailed); });
      }
      // 展开折叠时无感触发一次检查（5 分钟节流，防频繁展开刷请求）；
      // 每日检查开关开启时，即使不展开也会按天自动检测
      React.useEffect(function () {
        if (!open) return;
        var now = Date.now();
        var lastCheck = 0;
        try { lastCheck = parseInt(localStorage.getItem("dsh-easyrewrite:lastUpdateCheckTs") || "0", 10) || 0; } catch (e) { /* ignore */ }
        if (now - lastCheck < 5 * 60 * 1000 && updateVer !== "") { return; }
        try { localStorage.setItem("dsh-easyrewrite:lastUpdateCheckTs", String(now)); } catch (e) { /* ignore */ }
        if (!updateVer) setUpdateVer("…");
        doCheckUpdate();
      }, [open]);
      // 每日检测：开关开启时每天首次触发一次（不依赖展开）
      React.useEffect(function () {
        var autoOn = getBool("dsh-easyrewrite:autoCheckUpdate", false);
        if (!autoOn) return;
        var today = new Date().toISOString().slice(0, 10);
        var last = null;
        try { last = localStorage.getItem("dsh-easyrewrite:lastUpdateCheck"); } catch (e) { /* ignore */ }
        if (last === today) return;
        try { localStorage.setItem("dsh-easyrewrite:lastUpdateCheck", today); } catch (e) { /* ignore */ }
        doCheckUpdate();
      }, []);
      var sHotkey = React.useState(hotkeySetting());
      var hotkey = sHotkey[0];
      var setHotkeyState = sHotkey[1];
      var sHotkeyOn = React.useState(hotkeyEnabledSetting());
      var hotkeyOn = sHotkeyOn[0];
      var setHotkeyOn = sHotkeyOn[1];
      var sRecording = React.useState(false);
      var recording = sRecording[0];
      var setRecording = sRecording[1];
      var sHotkeyInvalid = React.useState(false);
      var hotkeyInvalid = sHotkeyInvalid[0];
      var setHotkeyInvalid = sHotkeyInvalid[1];
      // 录制监听：录制期间屏蔽全局快捷键（hotkeyCaptureActive）
      React.useEffect(function () {
        if (!recording) return;
        setHotkeyCaptureActive(true);
        function onKey(e) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "Escape") { setRecording(false); setHotkeyInvalid(false); return; }
          var combo = keydownCombo(e);
          if (!combo) { setHotkeyInvalid(true); return; }
          setHotkeyInvalid(false);
          setHotkeyState(combo);
          setHotkeySetting(combo);
          setRecording(false);
        }
        window.addEventListener("keydown", onKey, true);
        return function () {
          setHotkeyCaptureActive(false);
          window.removeEventListener("keydown", onKey, true);
        };
      }, [recording]);
      var sVisual = React.useState(recallVisualMode());
      var visual = sVisual[0];
      var setVisual = sVisual[1];
      var sStat = React.useState(statOnlyUser());
      var statOnly = sStat[0];
      var setStatOnly = sStat[1];
      var sConflict = React.useState(draftConflictMode());
      var conflict = sConflict[0];
      var setConflict = sConflict[1];
      var sWidth = React.useState(editWidthMode());
      var widthMode = sWidth[0];
      var setWidthMode = sWidth[1];
      var sCustom = React.useState(String(editWidthCustom()));
      var customW = sCustom[0];
      var setCustomW = sCustom[1];
      // review A1-5：showOriginalImages 开关的 hook 必须在顶层无条件调用——原先包在 open? 分支内的 IIFE 里，
      // 展开卡片瞬间 hook 数 +1 → React #300 → 设置卡片点不开（2b94851 引入，2026-09-04 用户实测复现）
      var sOrigImg = React.useState(showOriginalImages());
      var origImg = sOrigImg[0];
      var setOrigImg = sOrigImg[1];

      // 官方 PluginCard 同款：卡片/展开态/头部/标题/描述/箭头/内容区
      var cardStyle = {
        border: "1px solid var(--dsw-alias-border-l2)",
        background: "var(--dsw-alias-bg-layer-3)",
        borderRadius: "12px",
        listStyle: "none",
        transition: "border-color .16s, background .16s"
      };
      var cardOpenStyle = { background: "var(--dsw-alias-bg-layer-2)", borderColor: "var(--dsw-alias-label-dimmed)" };
      var headStyle = {
        appearance: "none",
        width: "100%",
        font: "inherit",
        color: "inherit",
        textAlign: "left",
        cursor: "pointer",
        background: "transparent",
        border: "none",
        borderRadius: "12px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 16px"
      };
      var headTextStyle = { display: "flex", flexDirection: "column", flex: "1", minWidth: "0", gap: "4px" };
      var titleStyle = { color: "var(--dsw-alias-label-primary)", fontSize: "15px", fontWeight: 600, lineHeight: "1.4" };
      var subStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: "13px", lineHeight: "1.5" };
      var chevronStyle = { color: "var(--dsw-alias-label-tertiary)", flex: "none", transition: "transform .16s", transform: "rotate(90deg)" };
      var chevronOpenStyle = { transform: "rotate(270deg)" };
      var bodyStyle = {
        borderTop: "1px solid var(--dsw-alias-border-l2)",
        margin: "0 16px",
        paddingTop: "14px",
        paddingBottom: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      };
      // 大项分组：组内 10px，组间 16px（bodyStyle gap）；每级缩进 4 空格（16px）
      var sectionStyle = { display: "flex", flexDirection: "column", gap: "10px", paddingLeft: "16px" };
      var groupTitleStyle = {
        fontSize: "14px",
        fontWeight: 600,
        color: "var(--dsw-alias-label-primary)",
        letterSpacing: "0.02em",
        lineHeight: "1.6"
      };
      var rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingLeft: "16px" };
      var labelStyle = { fontSize: "13px", color: "var(--dsw-alias-label-primary)" };
      var hintStyle = { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" };
      var groupStyle = { display: "flex", flexDirection: "column", gap: "6px", paddingLeft: "16px" };
      var inputStyle = {
        width: "90px",
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
        borderRadius: "8px",
        padding: "4px 8px",
        fontSize: "13px",
        background: "var(--dsw-alias-bg-base)",
        color: "var(--dsw-alias-label-primary)"
      };
      var disabledInputStyle = Object.assign({}, inputStyle, { opacity: 0.45, cursor: "not-allowed" });
      function switchRow(label, value, onChange, extraHint, disabled) {
        // 圆形勾选框：选中 = 白底黑勾（与确认胶囊同设计语言）；未选中 = 灰色圆环
        var checkSize = 20;
        var checkStyle = {
          width: checkSize,
          height: checkSize,
          borderRadius: "50%",
          border: "2px solid " + (value ? "#ffffff" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.45))"),
          background: value ? "#ffffff" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: value ? "#000000" : "transparent",
          fontSize: "13px",
          lineHeight: "13px",
          cursor: "pointer",
          flex: "none",
          margin: "0 2px",
          transition: "border-color .15s, background .15s, color .15s",
          userSelect: "none",
          boxSizing: "border-box"
        };
        return React.createElement("div", {
          style: Object.assign({}, rowStyle, disabled ? { opacity: 0.45, cursor: "not-allowed" } : null),
          "data-dsh-easyrewrite": "switch-row",
          title: disabled ? (extraHint || "") : undefined
        },
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: "0" } },
            React.createElement("span", { style: labelStyle }, label),
            extraHint ? React.createElement("span", { style: hintStyle }, extraHint) : null
          ),
          React.createElement("div", {
            role: "checkbox",
            "aria-checked": !!value,
            "aria-disabled": disabled || undefined,
            style: Object.assign({}, checkStyle, disabled ? { cursor: "not-allowed" } : null),
            onClick: function (e) { e.stopPropagation(); if (disabled) return; onChange(!value); }
          }, value ? React.createElement(IconCheckOutline, null) : null)
        );
      }
      // Apple 风格分段控件：灰色药丸长条 + 白色小药丸高亮当前项（滑动过渡，主题自适应）
      function segmentedGroup(options, value, onChange) {
        var n = options.length;
        var idx = 0;
        for (var i = 0; i < n; i++) { if (options[i][0] === value) { idx = i; break; } }
        var segStyle = {
          position: "relative",
          display: "flex",
          background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))",
          borderRadius: "999px",
          padding: "2px"
        };
        var thumbStyle = {
          position: "absolute",
          top: "2px",
          left: "calc(" + idx + " * (100% - 4px) / " + n + ")",
          width: "calc((100% - 4px) / " + n + ")",
          height: "calc(100% - 4px)",
          background: "var(--dsw-alias-bg-layer-3, #ffffff)",
          borderRadius: "999px",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.12)",
          transition: "left .18s ease",
          zIndex: 1
        };
        return React.createElement("div", { style: segStyle, role: "radiogroup" },
          React.createElement("div", { style: thumbStyle, "data-dsh-easyrewrite": "seg-thumb" }),
          options.map(function (opt) {
            var sel = value === opt[0];
            return React.createElement("div", {
              key: opt[0],
              role: "radio",
              "aria-checked": sel,
              style: {
                position: "relative",
                zIndex: 2,
                flex: "1",
                padding: "3px 10px",
                textAlign: "center",
                fontSize: "13px",
                lineHeight: "20px",
                cursor: "pointer",
                borderRadius: "999px",
                color: sel ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
                transition: "color .15s",
                whiteSpace: "nowrap",
                userSelect: "none"
              },
              onClick: function () { onChange(opt[0]); }
            }, opt[1]);
          })
        );
      }

      // 配置主体：两种挂法共用。
      //
      // 0.1.7 起卡片挂进 plugins.item，页面已经给了行外壳（标题来自插槽 label、描述、
      // 展开由页面管），卡片只该交出主体。自带 <li> + 可点头部会变成页面里多出来的一层
      // 折叠 —— 列表上一个下拉，点进去还有一个。旧插槽 settings.plugin.item 没有外壳，
      // 那种挂法仍旧要卡片自画，所以分流在函数末尾按 embedded 做。
      var cardBody = React.createElement("div", { style: bodyStyle },
          // —— 编辑 ——
          React.createElement("div", { style: sectionStyle },
            React.createElement("span", { style: groupTitleStyle }, L.sectionEdit),
            switchRow(L.rewrite, rewrite, function (v) { setRewrite(v); setBool("dsh-easyrewrite:rewriteOnClick", v); }),
            switchRow(L.editOffShowRecall, showRecall, function (v) {
              setShowRecall(v); setBool("dsh-easyrewrite:editOffShowRecall", v);
            }, rewrite ? L.lockedHint : null, rewrite),
            // 编辑宽度：三固定 + 自定义（固定时输入框禁用置灰）
            React.createElement("div", { style: groupStyle },
              React.createElement("span", { style: labelStyle }, L.editWidth),
              segmentedGroup([["compact", L.wCompact], ["standard", L.wStandard], ["extended", L.wExtended], ["custom", L.wCustom]], widthMode, function (v) { setWidthMode(v); setSetting("dsh-easyrewrite:editWidth", v); }),
              React.createElement("div", { style: rowStyle },
                React.createElement("span", { style: labelStyle }, L.customWidth),
                React.createElement("input", {
                  type: "number",
                  min: 100,
                  max: 1200,
                  style: widthMode === "custom" ? inputStyle : disabledInputStyle,
                  disabled: widthMode !== "custom",
                  placeholder: L.placeholderCustom,
                  value: customW,
                  onChange: function (e) {
                    setCustomW(e.target.value);
                    setSetting("dsh-easyrewrite:editWidthCustom", e.target.value);
                  }
                })
              )
            )
          ),
          // —— 撤回 ——
          React.createElement("div", { style: sectionStyle },
            React.createElement("span", { style: groupTitleStyle }, L.sectionRecall),
            switchRow(L.recallConfirm, confirmCapsule, function (v) { setConfirmCapsule(v); setBool("dsh-easyrewrite:recallConfirm", v); }),
            switchRow(L.showOriginalImages, origImg, function (v) { setOrigImg(v); setBool("dsh-easyrewrite:showOriginalImages", v); }),
            // 视觉模式
            React.createElement("div", { style: groupStyle },
              React.createElement("span", { style: labelStyle }, L.visualMode),
              segmentedGroup([["simple", L.visualSimple], ["minimal", L.visualMinimal], ["info", L.visualInfo]], visual, function (v) { setVisual(v); setSetting("dsh-easyrewrite:visualMode", v); })
            ),
            switchRow(L.statOnlyUser, statOnly, function (v) { setStatOnly(v); setBool("dsh-easyrewrite:statOnlyUser", v); }),
            // 撤回快捷键：总开关（Beta，默认关——避免与其他插件快捷键打架）
            switchRow(L.hotkeyEnable, hotkeyOn, function (v) {
              setHotkeyOn(v);
              setHotkeyEnabledSetting(v);
              if (!v) setRecording(false);
            }, L.hotkeyHint),
            // 键位行：始终显示；总开关关闭时录制按钮禁用置灰
            React.createElement("div", { style: rowStyle },
              React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                React.createElement("span", { style: labelStyle }, L.hotkey + "：" + (hotkey ? formatHotkey(hotkey) : L.hotkeyNone)),
                React.createElement("span", { style: hintStyle }, recording ? L.hotkeyRecording : (hotkey ? null : L.hotkeyHint)),
                hotkeyInvalid ? React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-error, #d9534f)" } }, L.hotkeyInvalid) : null
              ),
              React.createElement("button", {
                type: "button",
                disabled: !hotkeyOn,
                style: {
                  appearance: "none",
                  border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                  background: "transparent",
                  color: "var(--dsw-alias-label-secondary)",
                  borderRadius: "6px",
                  padding: "3px 10px",
                  fontSize: "12px",
                  cursor: hotkeyOn ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  flex: "none",
                  opacity: hotkeyOn ? 1 : 0.45
                },
                onClick: function () { setHotkeyInvalid(false); setRecording(!recording); }
              }, recording ? L.hotkeyRecording : L.hotkeyRecord)
            )
          ),
          // —— 回填 ——
          React.createElement("div", { style: sectionStyle },
            React.createElement("span", { style: groupTitleStyle }, L.sectionComposer),
            // 回填冲突模式
            React.createElement("div", { style: groupStyle },
              React.createElement("span", { style: labelStyle }, L.conflictMode),
              segmentedGroup([["overwrite", L.conflictOverwriteShort], ["merge", L.conflictMergeShort]], conflict, function (v) { setConflict(v); setSetting("dsh-easyrewrite:conflictMode", v); }),
              React.createElement("span", { style: hintStyle }, conflict === "merge" ? L.conflictMerge : L.conflictOverwrite)
            )
          ),
          // —— 版本 ——
          React.createElement("div", { style: sectionStyle },
            React.createElement("span", { style: groupTitleStyle }, L.sectionVersions),
            // 版本历史（三层折叠）：总开关默认收起 → 按对话名的家族折叠项 → 条目显最后对话时间
            // （官方无归档恢复入口，此处保留恢复并打开；review #6 后家族来自官方 lineage）
            React.createElement("div", { style: groupStyle },
              (function () {
                var families = listVersionFamilies(props.ctxSessions);
                if (families.length === 0) return React.createElement("span", { style: hintStyle }, L.versionFamilyNone);
                var snap = null;
                try { snap = props.ctxSessions.list.getSnapshot(); } catch (e) { /* ignore */ }
                var metaOf = function (vid) { return (snap && snap.byId && snap.byId[vid]) || {}; };
                var famName = function (fam) {
                  var best = null, bt = -1;
                  fam.versions.forEach(function (vid) {
                    var m = metaOf(vid); var tt = m.updatedAt || 0;
                    if (tt >= bt) { bt = tt; best = m.title || null; }
                  });
                  return best || (fam.versions.length + " " + L.versionCount);
                };
                var fmtStamp = function (tsv) {
                  if (!tsv) return "—";
                  var dd = new Date(tsv);
                  var p2 = function (x) { return (x < 10 ? "0" : "") + x; };
                  return dd.getFullYear() + "-" + p2(dd.getMonth() + 1) + "-" + p2(dd.getDate()) + " " + p2(dd.getHours()) + ":" + p2(dd.getMinutes());
                };
                // 折叠箭头：SVG 描边（官方图标同风格），像素级对齐、无字距
                var chev = function (openState) {
                  return React.createElement("svg", {
                    width: "18", height: "18", viewBox: "0 0 24 24",
                    style: { flex: "none", display: "block", color: "var(--dsw-alias-label-tertiary)", transform: openState ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .12s" }
                  }, React.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }));
                };
                var rowHead = { display: "flex", alignItems: "center", gap: "6px", padding: "5px 4px", cursor: "pointer", borderRadius: "6px" };
                var hdrRow = { display: "flex", alignItems: "center", cursor: "pointer" }; // 无 gap：SVG 箭头紧贴文字
                // 层1：版本历史总折叠（默认收起）
                return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                  React.createElement("div", { style: hdrRow, onClick: function () { setHistOpen(!histOpen); } },
                    chev(histOpen),
                    React.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } }, L.versionHistory),
                    React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", marginLeft: "auto" } }, families.length + "")
                  ),
                  histOpen ? families.map(function (fam) {
                    var open = !!famOpenMap[fam.rootId];
                    return React.createElement("div", { key: fam.rootId, style: { display: "flex", flexDirection: "column", gap: "2px", padding: "2px 0 2px 12px", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.14))" } },
                      React.createElement("div", { style: hdrRow, onClick: function () { var nm = {}; for (var ok2 in famOpenMap) nm[ok2] = famOpenMap[ok2]; nm[fam.rootId] = !open; setFamOpenMap(nm); } },
                        chev(open),
                        React.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1" } }, famName(fam)),
                        React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", flex: "none", marginLeft: "auto" } }, fam.versions.length + " " + L.versionCount)
                      ),
                      open ? fam.versions.map(function (vid, vi) {
                        return React.createElement("div", { key: vid, style: rowHead },
                          React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "none", width: "26px" } }, "v" + (vi + 1)),
                          React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", flex: "1" } }, fmtStamp(metaOf(vid).updatedAt)),
                          React.createElement("button", {
                            type: "button",
                            style: { appearance: "none", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" },
                            onClick: function (ev) {
                              ev.stopPropagation();
                              fetch("/bubble/unarchive", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ sessionId: vid }),
                                keepalive: true
                              }).then(function () {
                                if (typeof props.openSession === "function") props.openSession(vid);
                              }).catch(function () { /* ignore */ });
                            }
                          }, L.versionRestoreOpen)
                        );
                      }) : null
                    );
                  }) : null
                );
              })()
            )
          ),
          // —— 更新 ——
          React.createElement("div", { style: sectionStyle },
            React.createElement("span", { style: groupTitleStyle }, L.sectionUpdate),
            // 更新检查与执行（精简版：手动检查 + 每日检测可选 + 有新版提示）
            React.createElement("div", { style: groupStyle },
              React.createElement("span", { style: labelStyle }, L.currentVersion + "：" + (updateVer || "…")),
              (function () {
                if (!dshVer) return null;
                if (cmpDsh(dshVer, MIN_DSH_VERSION) < 0) return React.createElement("div", { key: "dsh-low", style: { display: "flex", flexDirection: "column", gap: "4px", padding: "6px 8px", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))", borderRadius: "8px" } },
                  React.createElement("span", { style: { fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)" } }, L.dshLowWarning.replace("{cur}", dshVer).replace("{min}", MIN_DSH_VERSION)),
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
                    React.createElement("code", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1" } }, "npm install -g @deepseek-ai/dsh@" + MIN_DSH_VERSION),
                    React.createElement("button", { type: "button", style: { appearance: "none", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "2px 8px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", flex: "none" }, onClick: function () { try { legacyCopy("npm install -g @deepseek-ai/dsh@" + MIN_DSH_VERSION); } catch (eC1) { /* ignore */ } } }, L.copyUpgradeCmd)
                  )
                );
                if (cmpDsh(MAX_TESTED_DSH_VERSION, dshVer) < 0) return React.createElement("div", { key: "dsh-new", style: { padding: "6px 8px", fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-secondary)", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))", borderRadius: "8px" } }, L.dshNewNotice.replace("{cur}", dshVer));
                return null;
              })(),
              !remindClosed && !getBool("dsh-easyrewrite:autoCheckUpdate", false) ? React.createElement("div", { key: "remind", style: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", background: "rgba(77,107,254,0.08)", borderRadius: "8px" } },
                React.createElement("span", { style: { fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)", flex: "1", minWidth: "0" } }, L.suggestAutoCheck),
                React.createElement("button", { type: "button", style: { appearance: "none", border: "none", background: "var(--dsw-static-deepseek-500, #4d6bfe)", color: "#ffffff", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" }, onClick: function () { setBool("dsh-easyrewrite:autoCheckUpdate", true); setBool("dsh-easyrewrite:autoCheckReminded", true); setAutoCheckOn(true); setRemindClosed(true); } }, L.enableNow),
                React.createElement("button", { type: "button", title: L.remindIgnore, style: { appearance: "none", border: "none", background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))", color: "var(--dsw-alias-label-secondary)", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flex: "none" }, onClick: function () { setBool("dsh-easyrewrite:autoCheckReminded", true); setRemindClosed(true); } }, L.remindIgnore)
              ) : null,
              React.createElement("div", { style: rowStyle },
                React.createElement("span", { style: hintStyle, flex: "1" }, updateMsg || ""),
                React.createElement("button", {
                  type: "button",
                  style: {
                    appearance: "none",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                    background: "transparent",
                    color: "var(--dsw-alias-label-secondary)",
                    borderRadius: "6px",
                    padding: "3px 10px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    flex: "none"
                  },
                  onClick: function () { doCheckUpdate(); }
                }, updateChecking ? L.checking : L.checkUpdate)
              ),
              updateAvailableVer ? React.createElement("div", { style: rowStyle },
                React.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-brand-primary, #4d6bfe)", flex: "1" } }, L.newVersion.replace("{ver}", updateAvailableVer)),
                React.createElement("button", {
                  type: "button",
                  style: {
                    appearance: "none",
                    border: "none",
                    background: "var(--dsw-static-deepseek-500, #4d6bfe)",
                    color: "#ffffff",
                    borderRadius: "6px",
                    padding: "3px 12px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    flex: "none"
                  },
                  onClick: function () { doUpdatePlugin(); }
                }, updateUpdating ? L.updating : L.updateNow)
              ) : null,
              switchRow(L.autoCheckUpdate, autoCheckOn, function (v) {
                setAutoCheckOn(v);
                setBool("dsh-easyrewrite:autoCheckUpdate", v);
              })
            )
          ),
          React.createElement("span", { style: hintStyle }, L.instant)
      );
      // plugins.item（0.1.7 起）：页面把同一个组件按 view 渲染两次 —— summary 当列表行与
      // 详情页的一行描述，page 当配置主体。图标、标题（取自插槽 label）、启用开关与详情页
      // 外壳都由页面提供，所以这里两者都不画头部。
      if (embedded) return props.view === "summary" ? L.subtitle : cardBody;
      // settings.plugin.item（0.1.5 及以下）：插槽不提供外壳，卡片自画可点头部。
      return React.createElement("li", { style: Object.assign({}, cardStyle, open ? cardOpenStyle : null), "data-dsh-easyrewrite": "settings-card" },
        React.createElement("button", {
          type: "button",
          style: headStyle,
          "aria-expanded": open,
          "aria-label": (open ? L.collapse : L.expand) + ": " + L.title,
          onClick: function () { setOpen(!open); }
        },
          React.createElement("span", { style: headTextStyle },
            React.createElement("span", { style: titleStyle }, L.title),
            React.createElement("span", { style: subStyle }, L.subtitle)
          ),
          React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", style: Object.assign({}, chevronStyle, open ? chevronOpenStyle : null) },
            React.createElement("path", { d: "M9 6l6 6-6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }))
        ),
        open ? cardBody : null
      );
    }


export { EasyRewriteSettingsCard };
