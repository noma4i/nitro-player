"use strict";

import { Image } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import { tryParseNativeNitroPlayerError, NitroPlayerRuntimeError } from "../types/NitroPlayerError.js";
const NitroPlayerSourceFactory = NitroModules.createHybridObject('NitroPlayerSourceFactory');
export const isNitroPlayerSource = obj => {
  return obj != null && typeof obj === 'object' && 'name' in obj && obj.name === 'NitroPlayerSource';
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
const VALID_STARTUP = new Set(['eager', 'lazy']);
const VALID_PRELOAD = new Set(['none', 'metadata', 'buffered']);
const VALID_OFFSCREEN = new Set(['cold', 'metadata', 'hot']);
const VALID_TRANSPORT_MODE = new Set(['auto', 'direct', 'proxy']);
const VALID_PREVIEW_MODE = new Set(['listener', 'always', 'manual']);
const assertEnum = (value, valid, field) => {
  if (value !== undefined && (typeof value !== 'string' || !valid.has(value))) {
    throw new NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: ${String(value)}`);
  }
};
const assertObject = (value, field) => {
  if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: expected an object`);
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
    throw tryParseNativeNitroPlayerError(error);
  }
};
export const createNitroSource = source => {
  if (isNitroPlayerSource(source)) {
    return source;
  }
  if (typeof source === 'object' && source !== null && 'uri' in source) {
    return createSourceFromConfig(source);
  }
  throw new NitroPlayerRuntimeError('player/invalid-source', 'Invalid source');
};
//# sourceMappingURL=sourceFactory.js.map