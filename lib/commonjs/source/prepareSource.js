"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toNativeSourceConfig = exports.prepareSource = exports.isPreparedSource = void 0;
var _NitroPlayerError = require("../support/errors/NitroPlayerError.js");
var _sourceValidation = require("./sourceValidation.js");
var _sourcePolicy = require("./sourcePolicy.js");
const DESCRIPTOR_BRAND = '__nitroPlaySourceDescriptor';
const stableSerialize = value => {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  const record = value;
  return `{${Object.keys(record).sort().filter(key => record[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
};
const resolveUri = uri => {
  if (typeof uri === 'string') {
    if (!uri) {
      throw new _NitroPlayerError.NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
    }
    return uri;
  }
  const {
    Image
  } = require('react-native');
  const resolvedSource = Image.resolveAssetSource(uri);
  if (!resolvedSource?.uri || typeof resolvedSource.uri !== 'string') {
    throw new _NitroPlayerError.NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
  }
  return resolvedSource.uri;
};
const isPreparedSource = source => Boolean(source && typeof source === 'object' && source[DESCRIPTOR_BRAND] === true);
exports.isPreparedSource = isPreparedSource;
const toConfig = input => {
  if (typeof input === 'string' || typeof input === 'number') {
    return {
      uri: input
    };
  }
  if (isPreparedSource(input)) {
    return input;
  }
  if (input && typeof input === 'object' && 'uri' in input) {
    return input;
  }
  throw new _NitroPlayerError.NitroPlayerRuntimeError('player/invalid-source', 'Invalid source');
};
const resolvePolicy = config => {
  const candidate = config.policy;
  if (candidate === undefined) {
    return _sourcePolicy.DEFAULT_SOURCE_POLICY;
  }
  if (!(0, _sourcePolicy.isNitroSourcePolicy)(candidate)) {
    throw new _NitroPlayerError.NitroPlayerRuntimeError('player/invalid-source', `Invalid source policy: ${String(candidate)}`);
  }
  return candidate;
};
const mergeConfig = config => {
  const policy = resolvePolicy(config);
  (0, _sourceValidation.validateSourceConfig)(config);
  const defaults = _sourcePolicy.SOURCE_POLICY_DEFAULTS[policy];
  const merged = {
    uri: resolveUri(config.uri),
    headers: config.headers,
    metadata: config.metadata,
    startup: config.startup ?? defaults.startup,
    buffer: config.buffer ?? defaults.buffer,
    retention: {
      ...defaults.retention,
      ...config.retention
    },
    transport: {
      ...defaults.transport,
      ...config.transport
    },
    preview: {
      ...defaults.preview,
      ...config.preview
    },
    policy
  };
  if (!defaults.retention && !config.retention) {
    merged.retention = undefined;
  }
  if (!defaults.transport && !config.transport) {
    merged.transport = undefined;
  }
  if (!defaults.preview && !config.preview) {
    merged.preview = undefined;
  }
  (0, _sourceValidation.validateSourceConfig)(merged);
  return merged;
};
const buildIdentity = config => {
  const requestKey = stableSerialize({
    uri: config.uri,
    headers: config.headers
  });
  const previewKey = stableSerialize({
    requestKey,
    preview: config.preview
  });
  const playbackKey = stableSerialize(config);
  return {
    playbackKey,
    requestKey,
    previewKey
  };
};
const prepareSource = input => {
  if (isPreparedSource(input)) {
    return input;
  }
  const config = mergeConfig(toConfig(input));
  const descriptor = {
    uri: config.uri,
    headers: config.headers,
    metadata: config.metadata,
    startup: config.startup,
    buffer: config.buffer,
    retention: config.retention,
    transport: config.transport,
    preview: config.preview,
    policy: config.policy,
    identity: buildIdentity(config),
    [DESCRIPTOR_BRAND]: true
  };
  return Object.freeze(descriptor);
};
exports.prepareSource = prepareSource;
const toNativeSourceConfig = source => {
  const descriptor = prepareSource(source);
  return {
    uri: descriptor.uri,
    headers: descriptor.headers,
    metadata: descriptor.metadata,
    startup: descriptor.startup,
    buffer: descriptor.buffer,
    retention: descriptor.retention,
    transport: descriptor.transport,
    preview: descriptor.preview
  };
};
exports.toNativeSourceConfig = toNativeSourceConfig;
//# sourceMappingURL=prepareSource.js.map