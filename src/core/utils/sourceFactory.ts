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

const VALID_STARTUP: ReadonlySet<string> = new Set(['eager', 'lazy']);
const VALID_PRELOAD: ReadonlySet<string> = new Set(['none', 'metadata', 'buffered']);
const VALID_OFFSCREEN: ReadonlySet<string> = new Set(['cold', 'metadata', 'hot']);
const VALID_TRANSPORT_MODE: ReadonlySet<string> = new Set(['auto', 'direct', 'proxy']);
const VALID_PREVIEW_MODE: ReadonlySet<string> = new Set(['listener', 'always', 'manual']);

const assertEnum = (value: unknown, valid: ReadonlySet<string>, field: string): void => {
  if (value !== undefined && (typeof value !== 'string' || !valid.has(value))) {
    throw new NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: ${String(value)}`);
  }
};

const assertObject = (value: unknown, field: string): void => {
  if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: expected an object`);
  }
};

const validateSourceConfig = (config: NitroSourceConfig): void => {
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

const normalizeSourceConfig = (config: NitroSourceConfig): NativeNitroPlayerConfig => {
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

const createSourceFromConfig = (config: NitroSourceConfig) => {
  const normalizedConfig = normalizeSourceConfig(config);
  try {
    return NitroPlayerSourceFactory.fromNitroPlayerConfig(normalizedConfig);
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};

export const createNitroSource = (source: NitroSourceConfig | NitroPlayerSource): NitroPlayerSource => {
  if (isNitroPlayerSource(source)) {
    return source;
  }

  if (typeof source === 'object' && source !== null && 'uri' in source) {
    return createSourceFromConfig(source);
  }

  throw new NitroPlayerRuntimeError('player/invalid-source', 'Invalid source');
};
