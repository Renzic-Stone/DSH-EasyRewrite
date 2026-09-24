
import * as React from "react";

    function PendingOriginalImage(props2) {
      var st = React.useState(null);
      var url = st[0];
      var setUrl = st[1];
      var errState = React.useState(false);
      var failed = errState[0];
      var setFailed = errState[1];
      React.useEffect(function () {
        var alive = true;
        props2.loadImage(props2.ref).then(function (u) { if (alive && u) setUrl(u); }, function () { if (alive) setFailed(true); });
        return function () { alive = false; };
      }, []);
      if (failed || !url) return null;
      return React.createElement("img", { src: url, style: { maxWidth: "100%", width: "auto", maxHeight: "280px", borderRadius: "12px", display: "block" } });
    }


export { PendingOriginalImage };
