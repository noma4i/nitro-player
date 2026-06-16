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
const VALID_STARTUP = new Set(['eager', 'lazy']);
const VALID_PRELOAD = new Set(['none', 'metadata', 'buffered']);
const VALID_OFFSCREEN = new Set(['cold', 'metadata', 'hot']);
const VALID_TRANSPORT_MODE = new Set(['auto', 'direct', 'proxy']);
const VALID_PREVIEW_MODE = new Set(['listener', 'always', 'manual']);
const assertEnum = (value, valid, field) => {
  if (value !== undefined && (typeof value !== 'string' || !valid.has(value))) {
    throw new _NitroPlayerError.NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: ${String(value)}`);
  }
};
const assertObject = (value, field) => {
  if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new _NitroPlayerError.NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: expected an object`);
  }
};
const validateSourceConfig = config => {
  assertEnum(config.startup, VALID_STARTUP, 'startup');
  assertObject(config.headers, 'headers');
  assertObject(config.metadata, 'metadata');
  assertObject(config.buffer, 'buffer');
  assertObject(config.retention, 'retention');
  assertEnum(config.retention?.preload, VALID_PRELOAD, 'retention.preload');
  assertEnum(config.retention?.offscreen, VALID_OFFSCREEN, 'retention.offscreen');
  assertObject(config.transport, 'transport');
  assertEnum(config.transport?.mode, VALID_TRANSPORT_MODE, 'transport.mode');
  assertObject(config.preview, 'preview');
  assertEnum(config.preview?.mode, VALID_PREVIEW_MODE, 'preview.mode');
};
const normalizeSourceConfig = config => {
  validateSourceConfig(config);
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