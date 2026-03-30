"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createPlayer = void 0;
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _sourceFactory = require("./sourceFactory.js");
var _NitroPlayerError = require("../types/NitroPlayerError.js");
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
    if ((0, _sourceFactory.isNitroPlayerSource)(source)) {
      return NitroPlayerFactory.createPlayer(source);
    }
    return NitroPlayerFactory.createPlayer((0, _sourceFactory.createNitroSource)(source));
  } catch (error) {
    throw (0, _NitroPlayerError.tryParseNativeNitroPlayerError)(error);
  }
};
exports.createPlayer = createPlayer;
//# sourceMappingURL=playerFactory.js.map