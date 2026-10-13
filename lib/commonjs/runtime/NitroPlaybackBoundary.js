"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NitroPlaybackBoundary = NitroPlaybackBoundary;
var _react = require("react");
var _nativePlaybackRuntime = require("./nativePlaybackRuntime.js");
function NitroPlaybackBoundary({
  children,
  suspended,
  allowGroups
}) {
  (0, _react.useLayoutEffect)(() => {
    if (!suspended) {
      return;
    }
    const handle = (0, _nativePlaybackRuntime.suspendNitroPlayback)('boundary', allowGroups);
    return () => {
      handle.release();
    };
  }, [suspended, allowGroups]);
  return /*#__PURE__*/(0, _react.createElement)(_react.Fragment, null, children);
}
//# sourceMappingURL=NitroPlaybackBoundary.js.map