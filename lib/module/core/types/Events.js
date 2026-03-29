"use strict";

function allKeysOf() {
  return (...arr) => {
    return arr;
  };
}
export const ALL_PLAYER_EVENTS = allKeysOf()('onBandwidthUpdate', 'onLoad', 'onLoadStart', 'onPlaybackState', 'onVolumeChange');
export const ALL_VIEW_EVENTS = allKeysOf()('onAttached', 'onDetached', 'onFullscreenChange', 'willEnterFullscreen', 'willExitFullscreen');
//# sourceMappingURL=Events.js.map