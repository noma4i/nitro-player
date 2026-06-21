"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isNitroPlayerSource = exports.createNativeNitroSource = void 0;
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _NitroPlayerError = require("../support/errors/NitroPlayerError.js");
var _prepareSource = require("./prepareSource.js");
const NitroPlayerSourceFactory = _reactNativeNitroModules.NitroModules.createHybridObject('NitroPlayerSourceFactory');
const isNitroPlayerSource = obj => {
  return obj != null && typeof obj === 'object' && 'name' in obj && obj.name === 'NitroPlayerSource';
};
exports.isNitroPlayerSource = isNitroPlayerSource;
const createNativeNitroSource = source => {
  const normalizedConfig = (0, _prepareSource.toNativeSourceConfig)(source);
  try {
    return NitroPlayerSourceFactory.fromNitroPlayerConfig(normalizedConfig);
  } catch (error) {
    throw (0, _NitroPlayerError.tryParseNativeNitroPlayerError)(error);
  }
};
exports.createNativeNitroSource = createNativeNitroSource;
//# sourceMappingURL=sourceFactory.js.map