"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isNitroPlayerSource = exports.createNitroSource = void 0;
var _reactNative = require("react-native");
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _NitroPlayerError = require("../types/NitroPlayerError.js");
const NitroPlayerSourceFactory = _reactNativeNitroModules.NitroModules.createHybridObject('NitroPlayerSourceFactory');
const isNitroPlayerSource = obj => {
  return obj != null && typeof obj === 'object' && 'name' in obj && obj.name === 'NitroPlayerSource';
};
exports.isNitroPlayerSource = isNitroPlayerSource;
const resolveUri = uri => {
  if (typeof uri === 'string') {
    if (!uri) {
      throw new _NitroPlayerError.NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
    }
    return uri;
  }
  const resolvedSource = _reactNative.Image.resolveAssetSource(uri);
  if (!resolvedSource?.uri || typeof resolvedSource.uri !== 'string') {
    throw new _NitroPlayerError.NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
  }
  return resolvedSource.uri;
};
const normalizeSourceConfig = config => {
  return {
    uri: resolveUri(config.uri),
    headers: config.headers,
    metadata: config.metadata,
    startup: config.startup,
    buffer: config.buffer,
    retention: config.retention,
    transport: config.transport,
    preview: config.preview
  };
};
const createSourceFromConfig = config => {
  const normalizedConfig = normalizeSourceConfig(config);
  try {
    return NitroPlayerSourceFactory.fromNitroPlayerConfig(normalizedConfig);
  } catch (error) {
    throw (0, _NitroPlayerError.tryParseNativeNitroPlayerError)(error);
  }
};
const createNitroSource = source => {
  if (isNitroPlayerSource(source)) {
    return source;
  }
  if (typeof source === 'object' && source !== null && 'uri' in source) {
    return createSourceFromConfig(source);
  }
  throw new _NitroPlayerError.NitroPlayerRuntimeError('player/invalid-source', 'Invalid source');
};
exports.createNitroSource = createNitroSource;
//# sourceMappingURL=sourceFactory.js.map