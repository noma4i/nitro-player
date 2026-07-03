"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _react = _interopRequireDefault(require("react"));
var _NitroPlayerView = _interopRequireDefault(require("../view/NitroPlayerView.js"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const NitroFeedRingSlotView = ({
  ring,
  slotId,
  resizeMode = 'cover',
  surfaceType,
  ...viewProps
}) => {
  const player = ring.getSlotPlayer(slotId);
  if (!player) {
    return null;
  }
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_NitroPlayerView.default, {
    player: player,
    controls: false,
    keepScreenAwake: false,
    resizeMode: resizeMode,
    surfaceType: surfaceType,
    ...viewProps
  });
};
var _default = exports.default = /*#__PURE__*/_react.default.memo(NitroFeedRingSlotView);
//# sourceMappingURL=NitroFeedRingSlotView.js.map