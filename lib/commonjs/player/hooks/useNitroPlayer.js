"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useNitroPlayer = void 0;
var _react = require("react");
var _prepareSource = require("../../source/prepareSource.js");
var _NitroPlayer = require("../NitroPlayer.js");
/**
 * Creates a `NitroPlayer` instance and manages its lifecycle.
 * @param source - The source of the video to play
 * @returns The `NitroPlayer` instance
 */
const useNitroPlayer = source => {
  const preparedSource = (0, _prepareSource.prepareSource)(source);
  const [player] = (0, _react.useState)(() => new _NitroPlayer.NitroPlayer(preparedSource));
  const preparedSourceRef = (0, _react.useRef)(preparedSource);
  preparedSourceRef.current = preparedSource;
  const previousPlaybackKeyRef = (0, _react.useRef)(preparedSource.identity.playbackKey);
  const sourceUpdateIdRef = (0, _react.useRef)(0);
  (0, _react.useLayoutEffect)(() => {
    player.__createNativePlayer(preparedSourceRef.current);
    previousPlaybackKeyRef.current = preparedSourceRef.current.identity.playbackKey;
    return () => player.__destroy();
  }, [player]);
  (0, _react.useLayoutEffect)(() => {
    if (previousPlaybackKeyRef.current === preparedSource.identity.playbackKey) {
      return;
    }
    previousPlaybackKeyRef.current = preparedSource.identity.playbackKey;
    const updateId = ++sourceUpdateIdRef.current;
    const source = preparedSourceRef.current;
    let isActive = true;
    void player.replaceSourceAsync(source).catch(error => {
      if (isActive && sourceUpdateIdRef.current === updateId) {
        console.error('[NitroPlay] Failed to replace source from React update', error);
      }
    });
    return () => {
      isActive = false;
    };
  }, [player, preparedSource.identity.playbackKey]);
  return player;
};
exports.useNitroPlayer = useNitroPlayer;
//# sourceMappingURL=useNitroPlayer.js.map