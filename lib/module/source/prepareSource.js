"use strict";

import { NitroPlayerRuntimeError } from "../support/errors/NitroPlayerError.js";
import { DEFAULT_SOURCE_POLICY, isNitroSourcePolicy, resolveSourcePolicyDefaults } from "./sourcePolicy.js";
import { validateSourceConfig } from "./sourceValidation.js";
const DESCRIPTOR_BRAND = '__nitroPlaySourceDescriptor';
const objectSourceCache = new WeakMap();
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
export const resolveUri = uri => {
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
const mergeConfigSection = (defaults, override) => {
  if (override === undefined) {
    return defaults;
  }
  if (typeof override !== 'object' || override === null || Array.isArray(override)) {
    return override;
  }
  return {
    ...defaults,
    ...override
  };
};
const mergeConfig = config => {
  const policy = resolvePolicy(config);
  const defaults = resolveSourcePolicyDefaults(policy);
  const merged = {
    uri: resolveUri(config.uri),
    headers: config.headers,
    metadata: config.metadata,
    startup: config.startup ?? defaults.startup,
    buffer: mergeConfigSection(defaults.buffer, config.buffer),
    retention: mergeConfigSection(defaults.retention, config.retention),
    transport: mergeConfigSection(defaults.transport, config.transport),
    preview: mergeConfigSection(defaults.preview, config.preview),
    policy
  };
  validateSourceConfig(merged);
  return merged;
};
const buildIdentity = config => {
  const playbackKey = stableSerialize(config);
  return {
    playbackKey
  };
};
export const prepareSource = input => {
  if (isPreparedSource(input)) {
    return input;
  }
  if (input && typeof input === 'object') {
    const cached = objectSourceCache.get(input);
    if (cached) {
      return cached;
    }
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
  const prepared = Object.freeze(descriptor);
  if (input && typeof input === 'object') {
    objectSourceCache.set(input, prepared);
  }
  return prepared;
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