import { getSetting } from "../../core/constants.js";

    /**
     * 编辑宽度三档（localStorage dsh-easyrewrite:editWidth；默认 wrap）：
     *  - 紧凑 bubble：从气泡原宽起步（不主动改变气泡大小），随打字横向扩展，**上限 360px**（还原真实气泡）
     *  - 标准 wrap：固定 360px（所见即所得，与紧凑同上限）
     *  - 扩展 composer：固定 748px 顶到头（等同输入框区域）
     * 字符宽度估算：最长行字符数 × 8px（中文 14 / 英文 7 的折中）+ padding 28。
     */
    /**
     * 编辑框宽度（V2.0.1 规格）：
     * - 内容宽度估算：全角/CJK 字符 ≈14px、半角 ≈8px（font-size 14px），行取最宽。
     * - 紧凑 compact：严格以气泡原宽（initW）起步，不改变当前大小；随打字按内容需要慢慢扩大，上限 360px。
     * - 标准 standard：与紧凑唯一区别——内容不满一行时自动扩成一行宽（360px）。
     * - 两档超过一行后都保持宽度不再主动扩张（高度自然换行增长）。
     */
    function editWidthFor(mode, text, initW) {
      // 扩展："100%" 撑满消息行（此前写死 748px 是旧窗口宽度遗物——内容列更宽时左侧够不到其他文字的左对齐线，2026-09-04 用户实测反馈）
      if (mode === "extended") return "100%";
      if (mode === "custom") return editWidthCustom();  // 自定义
      var linesArr = String(text || "").split("\n");
      var contentW = 0;
      for (var i = 0; i < linesArr.length; i++) {
        var s = linesArr[i];
        var w = 28; // 左右内边距
        for (var c = 0; c < s.length; c++) w += s.charCodeAt(c) > 0x2e7f ? 14 : 8;
        if (w > contentW) contentW = w;
      }
      contentW = Math.min(contentW, 360);               // 气泡上限 360px
      if (mode === "compact") {
        var base = Math.max(initW || 200, 44);          // 紧凑：严格气泡原宽起步（保底防 0）
        return Math.max(base, contentW);                // 随打字慢慢扩大，绝不跳变
      }
      return Math.max(360, contentW);                   // 标准：不满一行自动扩成一行宽
    }
    /** 编辑宽度档位：compact 紧凑 / standard 标准 / extended 扩展 / custom 自定义。兼容旧值（bubble/wrap/composer）。 */
    function editWidthMode() {
      var v = "standard";
      try { v = localStorage.getItem("dsh-easyrewrite:editWidth") || "standard"; } catch (e) { /* ignore */ }
      if (v === "bubble") return "compact";
      if (v === "wrap") return "standard";
      if (v === "composer") return "extended";
      return v;
    }
    function editWidthCustom() {
      try { var n = parseInt(localStorage.getItem("dsh-easyrewrite:editWidthCustom") || "", 10); return isFinite(n) && n > 100 && n <= 1200 ? n : 360; } catch (e) { return 360; }
    }

    /** 时间格式化（对齐官方 formatMessageClock）：今天 HH:MM；同年 M/D HH:MM；跨年 Y/M/D HH:MM。 */

export { editWidthFor, editWidthMode, editWidthCustom };
