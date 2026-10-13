"use strict";

import { Image } from 'react-native';
import { NitroPlayerRuntimeError } from "../support/errors/NitroPlayerError.js";
import { DEFAULT_SOURCE_POLICY, isNitroSourcePolicy, resolveSourcePolicyDefaults } from "./sourcePolicy.js";
import { validateSourceConfig } from "./sourceValidation.js";
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
  const defaults = resolveSourcePolicyDefaults(policy);
  const merged = {
    uri: resolveUri(config.uri),
    headers: config.headers,
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
    policy
  };
  if (!defaults.retention && !config.retention) {
    merged.retention = undefined;
  }
  if (!defaults.transport && !config.transport) {
    merged.transport = undefined;
  }
  validateSourceConfig(merged);
  return merged;
};
const buildIdentity = config => {
  const requestKey = stableSerialize({
    uri: config.uri,
    headers: config.headers
  });
  const playbackKey = stableSerialize({
    requestKey,
    startup: config.startup,
    buffer: config.buffer,
    retention: config.retention,
    transport: config.transport
  });
  return {
    playbackKey,
    requestKey
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
    startup: config.startup,
    buffer: config.buffer,
    retention: config.retention,
    transport: config.transport,
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
    startup: descriptor.startup,
    buffer: descriptor.buffer,
    retention: descriptor.retention,
    transport: descriptor.transport
  };
};
//# sourceMappingURL=prepareSource.js.map