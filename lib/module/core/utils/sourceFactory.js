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