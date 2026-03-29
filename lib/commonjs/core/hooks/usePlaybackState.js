"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.usePlaybackState = void 0;
var _react = require("react");
var _NitroPlayerError = require("../types/NitroPlayerError.js");
const getPlaybackStateSafe = player => {
  if (!player) {
    return null;
  }
  try {
    return player.playbackState;
  } catch (error) {
    if (error instanceof _NitroPlayerError.NitroPlayerRuntimeError && error.code === 'player/released') {
      return null;
    }
    throw error;
  }
};
const usePlaybackState = (player, options = {}) => {
  void options;
  const [state, setState] = (0, _react.useState)(() => getPlaybackStateSafe(player));
  (0, _react.useEffect)(() => {
    if (!player) {
      setState(null);
      return;
    }
    const initialState = getPlaybackStateSafe(player);
    setState(initialState);
    if (initialState === null) {
      return;
    }
    const subscription = player.addEventListener('onPlaybackState', next => {
      setState(next);
    });
    return () => {
      subscription.remove();
    };
  }, [player]);
  return state;
};
exports.usePlaybackState = usePlaybackState;
//# sourceMappingURL=usePlaybackState.js.map