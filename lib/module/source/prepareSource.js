"use strict";

import { NitroPlayerRuntimeError } from "../support/errors/NitroPlayerError.js";
import { validateSourceConfig } from "./sourceValidation.js";
import { DEFAULT_SOURCE_POLICY, isNitroSourcePolicy, SOURCE_POLICY_DEFAULTS } from "./sourcePolicy.js";
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
      throw new NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
    }
    return uri;
  }
  const {
    Image
  } = require('react-native');
  const resolvedSource = Image.resolveAssetSource(uri);
  if (!resolvedSource?.uri || typeof resolvedSource.uri !== 'string') {
    throw new NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
  }
  return resolvedSource.uri;
};
export const isPreparedSource = source => Boolean(source && typeof source === 'object' && source[DESCRIPTOR_BRAND] === true);
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
  throw new NitroPlayerRuntimeError('player/invalid-source', 'Invalid source');
};
const resolvePolicy = config => {
  const candidate = config.policy;
  if (candidate === undefined) {
    return DEFAULT_SOURCE_POLICY;
  }
  if (!isNitroSourcePolicy(candidate)) {
    throw new NitroPlayerRuntimeError('player/invalid-source', `Invalid source policy: ${String(candidate)}`);
  }
  return candidate;
};
const mergeConfig = config => {
  const policy = resolvePolicy(config);
  validateSourceConfig(config);
  const defaults = SOURCE_POLICY_DEFAULTS[policy];
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
  validateSourceConfig(merged);
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
export const prepareSource = input => {
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
export const toNativeSourceConfig = source => {
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
//# sourceMappingURL=prepareSource.js.map