
    // ---------- 撤回快捷键（默认 Ctrl+Z；可录制；输入框未聚焦且最近一条为用户消息时生效） ----------
    var HOTKEY_KEY = "dsh-easyrewrite:hotkey";
    var HOTKEY_ENABLED_KEY = "dsh-easyrewrite:hotkeyEnabled";
    let hotkeyCaptureActive = false;
export function setHotkeyCaptureActive(v) { hotkeyCaptureActive = v; } // 录制期间屏蔽全局触发
    /** 总开关（默认关——与其他插件快捷键不打架；Beta 功能）。 */
    function hotkeyEnabledSetting() {
      return getBool(HOTKEY_ENABLED_KEY, false);
    }
    function setHotkeyEnabledSetting(v) {
      setBool(HOTKEY_ENABLED_KEY, v);
    }
    /** 当前键位：未设置时返回空串（无默认快捷键）。 */
    function hotkeySetting() {
      try {
        var v = localStorage.getItem(HOTKEY_KEY);
        if (v && /^((ctrl|meta|alt|shift)\+)+(key[a-z0-9]|digit[0-9]|f[0-9]{1,2}|arrow(left|right|up|down)|space|enter|escape|backspace|delete|tab|numpad[0-9]+)$/.test(v)) return v;
      } catch (e) { /* ignore */ }
      return "";
    }
    function setHotkeySetting(combo) {
      try { localStorage.setItem(HOTKEY_KEY, combo); } catch (e) { /* ignore */ }
    }
    /** 录制：把 keydown 事件转成组合键串（必须带修饰键；返回 null 表示无效）。 */
    function keydownCombo(e) {
      var parts = [];
      if (e.ctrlKey) parts.push("ctrl");
      if (e.metaKey) parts.push("meta");
      if (e.altKey) parts.push("alt");
      if (e.shiftKey) parts.push("shift");
      var code = String(e.code || "").toLowerCase();
      if (!code || code.indexOf("control") === 0 || code.indexOf("meta") === 0 || code.indexOf("alt") === 0 || code.indexOf("shift") === 0) return null;
      if (parts.length === 0) return null; // 必须至少一个修饰键
      parts.push(code);
      return parts.join("+");
    }
    /** 匹配：keydown 事件是否等于设置的组合键。 */
    function keydownMatches(e, combo) {
      if (!combo) return false;
      var parts = combo.split("+");
      var wantCtrl = parts.indexOf("ctrl") >= 0;
      var wantMeta = parts.indexOf("meta") >= 0;
      var wantAlt = parts.indexOf("alt") >= 0;
      var wantShift = parts.indexOf("shift") >= 0;
      if (String(e.code || "").toLowerCase() !== parts[parts.length - 1]) return false;
      if (!!e.ctrlKey !== wantCtrl) return false;
      if (!!e.metaKey !== wantMeta) return false;
      if (!!e.altKey !== wantAlt) return false;
      if (!!e.shiftKey !== wantShift) return false;
      return true;
    }
    /** 显示文本：ctrl+keyz → "Ctrl+Z"；meta+keyz → "⌘+Z"。 */
    function formatHotkey(combo) {
      if (!combo) return "";
      var parts = combo.split("+");
      var names = parts.slice(0, -1).map(function (p) {
        if (p === "ctrl") return "Ctrl";
        if (p === "meta") return "⌘";
        if (p === "alt") return "Alt";
        if (p === "shift") return "Shift";
        return p;
      });
      var code = parts[parts.length - 1] || "";
      var keyName = code;
      if (/^key[a-z]$/.test(code)) keyName = code.slice(3).toUpperCase();
      else if (/^digit[0-9]$/.test(code)) keyName = code.slice(5);
      else if (code === "arrowleft") keyName = "←";
      else if (code === "arrowright") keyName = "→";
      else if (code === "arrowup") keyName = "↑";
      else if (code === "arrowdown") keyName = "↓";
      else if (/^f([0-9]{1,2})$/.test(code)) keyName = code.toUpperCase();
      else if (/^numpad/.test(code)) keyName = code.slice(6);
      else if (code === "space") keyName = "Space";
      else if (code === "enter") keyName = "Enter";
      else if (code === "escape") keyName = "Esc";
      else if (code === "backspace") keyName = "Backspace";
      else if (code === "delete") keyName = "Del";
      else if (code === "tab") keyName = "Tab";
      else keyName = code.replace(/^key/, "").toUpperCase();
      return names.concat([keyName]).join("+");
    }


export {
  HOTKEY_KEY,
  HOTKEY_ENABLED_KEY,
  hotkeyCaptureActive,
  hotkeyEnabledSetting,
  setHotkeyEnabledSetting,
  hotkeySetting,
  setHotkeySetting,
  keydownCombo,
  keydownMatches,
  formatHotkey
};
