
    // ---------- 编辑态图片持久化辅助（bug② 刷新恢复用）：File ↔ dataURL ----------
    function fileToDataUrl(file) {
      return new Promise(function (resolve, reject) {
        try {
          var fr = new FileReader();
          fr.onload = function () { resolve(String(fr.result)); };
          fr.onerror = function () { reject(fr.error || new Error("file-read-failed")); };
          fr.readAsDataURL(file);
        } catch (e) { reject(e); }
      });
    }
    function dataUrlToFile(dataUrl, name) {
      var parts = String(dataUrl).split(",");
      var mimeMatch = parts[0].match(/:(.*?);/);
      var mime = (mimeMatch && mimeMatch[1]) || "image/png";
      var bstr = atob(parts[1] || "");
      var u8 = new Uint8Array(bstr.length);
      for (var i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
      return new File([u8], name || "image." + (mime.split("/")[1] || "png"), { type: mime });
    }

export { fileToDataUrl, dataUrlToFile };
