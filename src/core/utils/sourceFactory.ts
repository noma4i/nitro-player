import { Image } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import type { NitroPlayerSource, NitroPlayerSourceFactory } from '../../spec/nitro/NitroPlayerSource.nitro';
import type { NativeNitroPlayerConfig, NitroSourceConfig } from '../types/NitroPlayerConfig';
import type { MemoryProfile, OffscreenRetention, PreloadLevel } from '../types/MemoryConfig';
import { tryParseNativeNitroPlayerError, NitroPlayerRuntimeError } from '../types/NitroPlayerError';
import { hlsCacheProxy } from '../../hls/hlsCacheProxy';

const NitroPlayerSourceFactory = NitroModules.createHybridObject<NitroPlayerSourceFactory>('NitroPlayerSourceFactory');
const nitroSourceIds = new WeakMap<object, number>();
let nitroSourceIdCounter = 1;

const stableSerialize = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(String(value));
};

const getNitroSourceObjectId = (source: NitroPlayerSource): number => {
  const existingId = nitroSourceIds.get(source);
  if (existingId !== undefined) {
    return existingId;
  }

  const nextId = nitroSourceIdCounter++;
  nitroSourceIds.set(source, nextId);
  return nextId;
};

export const isNitroPlayerSource = (obj: unknown): obj is NitroPlayerSource => {
  return obj != null && typeof obj === 'object' && 'name' in obj && (obj as { name: unknown }).name === 'NitroPlayerSource';
};

export const getSourceIdentityKey = (source: NitroSourceConfig | NitroPlayerSource): string => {
  if (isNitroPlayerSource(source)) return `nitro-source:${getNitroSourceObjectId(source)}`;
  if (typeof source === 'object' && source !== null && 'uri' in source) {
    return stableSerialize(source);
  }
  return '';
};

const isHlsManifestUrl = (uri: string) => {
  const [withoutHash] = uri.split('#', 1);
  const [withoutQuery] = withoutHash.split('?', 1);
  return withoutQuery.toLowerCase().endsWith('.m3u8');
};

type ResolvedLifecycleConfig = {
  lifecycle: MemoryProfile;
  preloadLevel: PreloadLevel;
  offscreenRetention: OffscreenRetention;
  trimDelayMs: number;
};

const LIFECYCLE_DEFAULTS: Record<MemoryProfile, ResolvedLifecycleConfig> = {
  feed: {
    lifecycle: 'feed',
    preloadLevel: 'metadata',
    offscreenRetention: 'metadata',
    trimDelayMs: 3000
  },
  balanced: {
    lifecycle: 'balanced',
    preloadLevel: 'buffered',
    offscreenRetention: 'hot',
    trimDelayMs: 10000
  },
  immersive: {
    lifecycle: 'immersive',
    preloadLevel: 'buffered',
    offscreenRetention: 'hot',
    trimDelayMs: Number.POSITIVE_INFINITY
  }
};

const normalizePreloadLevel = (preloadLevel: NitroSourceConfig['advanced'] extends infer _ ? PreloadLevel | undefined : never): PreloadLevel | undefined => {
  if (preloadLevel === 'none' || preloadLevel === 'metadata' || preloadLevel === 'buffered') {
    return preloadLevel;
  }

  return undefined;
};

const normalizeOffscreenRetention = (offscreenRetention: NitroSourceConfig['advanced'] extends infer _ ? OffscreenRetention | undefined : never): OffscreenRetention | undefined => {
  if (offscreenRetention === 'cold' || offscreenRetention === 'metadata' || offscreenRetention === 'hot') {
    return offscreenRetention;
  }

  return undefined;
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

const resolveLifecycleConfig = (config: NitroSourceConfig, defaultLifecycle: MemoryProfile): ResolvedLifecycleConfig => {
  const lifecycle = config.lifecycle ?? defaultLifecycle;
  const defaults = LIFECYCLE_DEFAULTS[lifecycle];
  const lifecycleOverrides = config.advanced?.lifecycle;
  const trimDelayMs = lifecycleOverrides?.trimDelayMs ?? defaults.trimDelayMs;

  return {
    lifecycle,
    preloadLevel: normalizePreloadLevel(lifecycleOverrides?.preloadLevel) ?? defaults.preloadLevel,
    offscreenRetention: normalizeOffscreenRetention(lifecycleOverrides?.offscreenRetention) ?? defaults.offscreenRetention,
    trimDelayMs: Number.isFinite(trimDelayMs) || trimDelayMs === Number.POSITIVE_INFINITY ? trimDelayMs : defaults.trimDelayMs
  };
};

const normalizeSourceConfig = (config: NitroSourceConfig, defaultLifecycle: MemoryProfile = 'balanced'): NativeNitroPlayerConfig => {
  const normalizedUri = resolveUri(config.uri);
  const lifecycleConfig = resolveLifecycleConfig(config, defaultLifecycle);
  const shouldUseHlsProxy = config.advanced?.transport?.useHlsProxy !== false;
  const uri = shouldUseHlsProxy && isHlsManifestUrl(normalizedUri)
    ? hlsCacheProxy.getProxiedUrl(normalizedUri, config.headers)
    : normalizedUri;

  return {
    uri,
    headers: config.headers,
    metadata: config.metadata,
    initialization: config.initialization ?? 'eager',
    lifecycle: lifecycleConfig.lifecycle,
    advanced: {
      buffer: config.advanced?.buffer,
      transport: {
        useHlsProxy: shouldUseHlsProxy
      },
      lifecycle: {
        preloadLevel: lifecycleConfig.preloadLevel,
        offscreenRetention: lifecycleConfig.offscreenRetention,
        trimDelayMs: lifecycleConfig.trimDelayMs
      }
    }
  };
};

const createSourceFromConfig = (config: NitroSourceConfig, defaultLifecycle: MemoryProfile = 'balanced') => {
  const normalizedConfig = normalizeSourceConfig(config, defaultLifecycle);
  try {
    return NitroPlayerSourceFactory.fromNitroPlayerConfig(normalizedConfig);
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};

export const createNitroSource = (
  source: NitroSourceConfig | NitroPlayerSource,
  defaultLifecycle: MemoryProfile = 'balanced'
): NitroPlayerSource => {
  if (isNitroPlayerSource(source)) {
    return source;
  }

  if (typeof source === 'object' && source !== null && 'uri' in source) {
    return createSourceFromConfig(source, defaultLifecycle);
  }

  throw new NitroPlayerRuntimeError('player/invalid-source', 'Invalid source');
};

export const createSource = createNitroSource;
