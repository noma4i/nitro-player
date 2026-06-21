"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useNitroPlayer = void 0;
var _react = require("react");
var _NitroPlayer = require("../NitroPlayer.js");
var _useManagedInstance = require("../../support/useManagedInstance.js");
var _prepareSource = require("../../source/prepareSource.js");
/**
 * Creates a `NitroPlayer` instance and manages its lifecycle.
 * @param source - The source of the video to play
 * @returns The `NitroPlayer` instance
 */
const useNitroPlayer = source => {
  const preparedSource = (0, _prepareSource.prepareSource)(source);
  const player = (0, _useManagedInstance.useManagedInstance)({
    factory: () => {
      return new _NitroPlayer.NitroPlayer(preparedSource);
    },
    cleanup: player => {
      player.__destroy();
    }
  }, []);
  const previousSourceRef = (0, _react.useRef)(preparedSource);
  const replaceQueueRef = (0, _react.useRef)(Promise.resolve());
  const sourceUpdateIdRef = (0, _react.useRef)(0);
  (0, _react.useEffect)(() => {
    if (previousSourceRef.current.identity.playbackKey === preparedSource.identity.playbackKey) {
      return;
    }
    previousSourceRef.current = preparedSource;
    const updateId = ++sourceUpdateIdRef.current;
    let isActive = true;
    replaceQueueRef.current = replaceQueueRef.current.catch(() => undefined).then(() => {
      if (!isActive) {
        return;
      }
      return player.replaceSourceAsync(preparedSource);
    }).catch(error => {
      if (isActive && sourceUpdateIdRef.current === updateId) {
        console.error('[NitroPlay] Failed to replace source from React update', error);
      }
    });
    return () => {
      isActive = false;
    };
  }, [player, preparedSource]);
  return player;
};
exports.useNitroPlayer = useNitroPlayer;
//# sourceMappingURL=useNitroPlayer.js.map