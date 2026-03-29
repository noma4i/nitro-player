"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ALL_VIEW_EVENTS = exports.ALL_PLAYER_EVENTS = void 0;
function allKeysOf() {
  return (...arr) => {
    return arr;
  };
}
const ALL_PLAYER_EVENTS = exports.ALL_PLAYER_EVENTS = allKeysOf()('onBandwidthUpdate', 'onLoad', 'onLoadStart', 'onPlaybackState', 'onVolumeChange');
const ALL_VIEW_EVENTS = exports.ALL_VIEW_EVENTS = allKeysOf()('onAttached', 'onDetached', 'onFullscreenChange', 'willEnterFullscreen', 'willExitFullscreen');
//# sourceMappingURL=Events.js.map