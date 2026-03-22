import { Image } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import type { NitroPlayerSource, NitroPlayerSourceFactory } from '../../spec/nitro/NitroPlayerSource.nitro';
import type { NativeNitroPlayerConfig, NitroPlayerConfig, NitroPlayerSource as NitroPlayerSourceType } from '../types/NitroPlayerConfig';
import type { MemoryConfig, MemoryProfile, OffscreenRetention, PreloadLevel } from '../types/MemoryConfig';
import { tryParseNativeNitroPlayerError, NitroPlayerRuntimeError } from '../types/NitroPlayerError';
import { hlsCacheProxy } from '../../hls/hlsCacheProxy';

const NitroPlayerSourceFactory = NitroModules.createHybridObject<NitroPlayerSourceFactory>('NitroPlayerSourceFactory');

export const isNitroPlayerSource = (obj: unknown): obj is NitroPlayerSource => {
  return obj != null && typeof obj === 'object' && 'name' in obj && (obj as { name: unknown }).name === 'NitroPlayerSource';
};

export const getSourceIdentityKey = (source: NitroPlayerConfig | NitroPlayerSourceType | NitroPlayerSource): string => {
  if (typeof source === 'string') return source;
  if (typeof source === 'number') return String(source);
  if (isNitroPlayerSource(source)) return source.uri;
  if (typeof source === 'object' && source !== null && 'uri' in source) {
    const s = source as NitroPlayerConfig;
    return [s.uri, s.useHlsProxy, s.memoryConfig?.profile, s.memoryConfig?.preloadLevel, s.memoryConfig?.offscreenRetention].join('|');
  }
  return '';
};

const isHlsManifestUrl = (uri: string) => {
  const [withoutHash] = uri.split('#', 1);
  const [withoutQuery] = withoutHash.split('?', 1);
  return withoutQuery.toLowerCase().endsWith('.m3u8');
};

type ResolvedMemoryConfig = Required<Pick<MemoryConfig, 'profile' | 'preloadLevel' | 'offscreenRetention'>> & {
  pauseTrimDelayMs: number;
};

const MEMORY_PROFILE_DEFAULTS: Record<MemoryProfile, ResolvedMemoryConfig> = {
  feed: {
    profile: 'feed',
    preloadLevel: 'buffered',
    offscreenRetention: 'hot',
    pauseTrimDelayMs: 3000
  },
  balanced: {
    profile: 'balanced',
    preloadLevel: 'buffered',
    offscreenRetention: 'hot',
    pauseTrimDelayMs: 10000
  },
  immersive: {
    profile: 'immersive',
    preloadLevel: 'buffered',
    offscreenRetention: 'hot',
    pauseTrimDelayMs: Number.POSITIVE_INFINITY
  }
};

const normalizePreloadLevel = (preloadLevel: MemoryConfig['preloadLevel']): PreloadLevel | undefined => {
  if (preloadLevel === 'none' || preloadLevel === 'metadata' || preloadLevel === 'buffered') {
    return preloadLevel;
  }

  return undefined;
};

const normalizeOffscreenRetention = (offscreenRetention: MemoryConfig['offscreenRetention']): OffscreenRetention | undefined => {
  if (offscreenRetention === 'cold' || offscreenRetention === 'metadata' || offscreenRetention === 'hot') {
    return offscreenRetention;
  }

  return undefined;
};

const resolveMemoryConfig = (memoryConfig: MemoryConfig | undefined, defaultProfile: MemoryProfile): ResolvedMemoryConfig => {
  const profile = memoryConfig?.profile ?? defaultProfile;
  const defaults = MEMORY_PROFILE_DEFAULTS[profile];
  const pauseTrimDelayMs = memoryConfig?.pauseTrimDelayMs ?? defaults.pauseTrimDelayMs;

  return {
    profile,
    preloadLevel: normalizePreloadLevel(memoryConfig?.preloadLevel) ?? defaults.preloadLevel,
    offscreenRetention: normalizeOffscreenRetention(memoryConfig?.offscreenRetention) ?? defaults.offscreenRetention,
    pauseTrimDelayMs: Number.isFinite(pauseTrimDelayMs) || pauseTrimDelayMs === Number.POSITIVE_INFINITY ? pauseTrimDelayMs : defaults.pauseTrimDelayMs
  };
};

/**
 * Creates a `NitroPlayerSource` instance from a URI (string).
 *
 * @param uri - The URI of the video to play
 * @returns The `NitroPlayerSource` instance
 */
export const createSourceFromUri = (uri: string, defaultMemoryProfile: MemoryProfile = 'balanced') => {
  if (!uri || typeof uri !== 'string') {
    throw new Error('RNV: Invalid source. The URI must be a non-empty string.');
  }

  return createSourceFromNitroPlayerConfig(
    {
      uri,
      initializeOnCreation: true,
      memoryConfig: {
        profile: defaultMemoryProfile
      }
    },
    defaultMemoryProfile
  );
};

/**
 * Creates a `NitroPlayerSource` instance from a `NitroPlayerConfig`.
 *
 * @note The `uri` property is required to be a string.
 *
 * @param config - The `NitroPlayerConfig` to create the `NitroPlayerSource` from
 * @returns The `NitroPlayerSource` instance
 */
export const createSourceFromNitroPlayerConfig = (config: NitroPlayerConfig & { uri: string }, defaultMemoryProfile: MemoryProfile = 'balanced') => {
  if (!config.uri || typeof config.uri !== 'string') {
    throw new NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
  }

  const normalizedConfig: NitroPlayerConfig & { uri: string } = { ...config };

  // Auto-proxy .m3u8 URLs through HLS cache proxy (if running)
  if (normalizedConfig.useHlsProxy !== false && isHlsManifestUrl(normalizedConfig.uri)) {
    normalizedConfig.uri = hlsCacheProxy.getProxiedUrl(normalizedConfig.uri, normalizedConfig.headers);
  }

  // Set default value for initializeOnCreation (true)
  if (normalizedConfig.initializeOnCreation === undefined) {
    normalizedConfig.initializeOnCreation = true;
  }

  normalizedConfig.memoryConfig = resolveMemoryConfig(normalizedConfig.memoryConfig, defaultMemoryProfile);

  try {
    return NitroPlayerSourceFactory.fromNitroPlayerConfig(normalizedConfig as NativeNitroPlayerConfig);
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};

/**
 * Creates a `NitroPlayerSource`
 *
 * @param source - The `NitroPlayerSourceType` to create the `NitroPlayerSource` from
 * @returns The `NitroPlayerSource` instance
 */
export const createSource = (source: NitroPlayerSourceType | NitroPlayerConfig | NitroPlayerSource, defaultMemoryProfile: MemoryProfile = 'balanced'): NitroPlayerSource => {
  // If source is a NitroPlayerSource, we can directly return it
  if (isNitroPlayerSource(source)) {
    return source;
  }

  // If source is a string, we can directly create the player
  if (typeof source === 'string') {
    return createSourceFromUri(source, defaultMemoryProfile);
  }

  // If source is a number (asset), we need to resolve the asset source and create the player
  if (typeof source === 'number') {
    const resolvedSource = Image.resolveAssetSource(source);
    if (!resolvedSource?.uri || typeof resolvedSource.uri !== 'string') {
      throw new NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
    }
    return createSourceFromUri(resolvedSource.uri, defaultMemoryProfile);
  }

  // If source is an object (NitroPlayerConfig)
  if (typeof source === 'object' && source !== null && 'uri' in source) {
    if (typeof source.uri === 'string') {
      return createSourceFromNitroPlayerConfig(source as NitroPlayerConfig & { uri: string }, defaultMemoryProfile);
    }

    if (typeof source.uri === 'number') {
      const resolvedSource = Image.resolveAssetSource(source.uri);
      if (!resolvedSource?.uri || typeof resolvedSource.uri !== 'string') {
        throw new NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
      }

      const config = {
        ...source,
        uri: resolvedSource.uri
      };

      return createSourceFromNitroPlayerConfig(config, defaultMemoryProfile);
    }

    throw new NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
  }

  throw new NitroPlayerRuntimeError('player/invalid-source', 'Invalid source');
};
