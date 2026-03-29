"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useNitroPlayer = void 0;
var _react = require("react");
var _NitroPlayer = require("../NitroPlayer.js");
var _useManagedInstance = require("./useManagedInstance.js");
/**
 * Creates a `NitroPlayer` instance and manages its lifecycle.
 * @param source - The source of the video to play
 * @returns The `NitroPlayer` instance
 */
const useNitroPlayer = source => {
  const player = (0, _useManagedInstance.useManagedInstance)({
    factory: () => {
      return new _NitroPlayer.NitroPlayer(source);
    },
    cleanup: player => {
      player.__destroy();
    }
  }, []);
  const previousSourceRef = (0, _react.useRef)(source);
  (0, _react.useEffect)(() => {
    if (previousSourceRef.current === source) {
      return;
    }
    previousSourceRef.current = source;
    let isActive = true;
    const replacePromise = player.replaceSourceAsync(source);
    Promise.resolve(replacePromise).catch(error => {
      if (isActive) {
        console.error('[NitroPlay] Failed to replace source from React update', error);
      }
    });
    return () => {
      isActive = false;
    };
  }, [player, source]);
  return player;
};
exports.useNitroPlayer = useNitroPlayer;
//# sourceMappingURL=useNitroPlayer.js.map