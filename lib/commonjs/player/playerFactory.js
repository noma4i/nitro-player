"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createPlayer = void 0;
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _sourceFactory = require("../source/sourceFactory.js");
var _NitroPlayerError = require("../support/errors/NitroPlayerError.js");
const NitroPlayerFactory = _reactNativeNitroModules.NitroModules.createHybridObject('NitroPlayerFactory');
/**
 * @internal
 * Creates a Native NitroPlayer instance.
 *
 * @param source - The source of the video to play
 * @returns The Native NitroPlayer instance
 */
const createPlayer = source => {
  try {
    const nativeSource = (0, _sourceFactory.isNitroPlayerSource)(source) ? source : (0, _sourceFactory.createNativeNitroSource)(source);
    return {
      player: NitroPlayerFactory.createPlayer(nativeSource),
      source: nativeSource
    };
  } catch (error) {
    throw (0, _NitroPlayerError.tryParseNativeNitroPlayerError)(error);
  }
};
exports.createPlayer = createPlayer;
//# sourceMappingURL=playerFactory.js.map