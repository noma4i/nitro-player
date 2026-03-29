import { Image } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import type { NitroPlayerSource, NitroPlayerSourceFactory } from '../../spec/nitro/NitroPlayerSource.nitro';
import type { NativeNitroPlayerConfig, NitroSourceConfig } from '../types/NitroPlayerConfig';
import { tryParseNativeNitroPlayerError, NitroPlayerRuntimeError } from '../types/NitroPlayerError';

const NitroPlayerSourceFactory = NitroModules.createHybridObject<NitroPlayerSourceFactory>('NitroPlayerSourceFactory');

export const isNitroPlayerSource = (obj: unknown): obj is NitroPlayerSource => {
  return obj != null && typeof obj === 'object' && 'name' in obj && (obj as { name: unknown }).name === 'NitroPlayerSource';
};

const resolveUri = (uri: NitroSourceConfig['uri']): string => {
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

const normalizeSourceConfig = (config: NitroSourceConfig): NativeNitroPlayerConfig => {
  return {
    uri: resolveUri(config.uri),
    headers: config.headers,
    metadata: config.metadata,
    initialization: config.initialization,
    lifecycle: config.lifecycle,
    advanced: config.advanced
  };
};

const createSourceFromConfig = (config: NitroSourceConfig) => {
  const normalizedConfig = normalizeSourceConfig(config);
  try {
    return NitroPlayerSourceFactory.fromNitroPlayerConfig(normalizedConfig);
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};

export const createNitroSource = (
  source: NitroSourceConfig | NitroPlayerSource
): NitroPlayerSource => {
  if (isNitroPlayerSource(source)) {
    return source;
  }

  if (typeof source === 'object' && source !== null && 'uri' in source) {
    return createSourceFromConfig(source);
  }

  throw new NitroPlayerRuntimeError('player/invalid-source', 'Invalid source');
};

export const createSource = createNitroSource;
