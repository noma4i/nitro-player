import { resolveSource } from '../source/resolveSource';
import type { ResolvableSource } from '../source/resolveSource';
import { createUnavailableWarner, getNativeStreamRuntime } from '../support/nativeStreamRuntime';
import type { StreamCacheConfig, StreamCacheNativeModule, StreamCacheStats, StreamHeaders, StreamSourceCacheStats } from './types';

export const DEFAULT_STREAM_CACHE_MAX_BYTES = 4 * 1024 * 1024 * 1024;

const DEFAULT_CACHE_STATS: StreamCacheStats = {
  totalSize: 0,
  fileCount: 0,
  maxSize: DEFAULT_STREAM_CACHE_MAX_BYTES
};

const DEFAULT_STREAM_CACHE_STATS: StreamSourceCacheStats = {
  ...DEFAULT_CACHE_STATS,
  streamSize: 0,
  streamFileCount: 0
};

const NativeStreamCache = getNativeStreamRuntime<StreamCacheNativeModule>();

const isHlsManifestUrl = (uri: string): boolean => {
  const withoutQuery = uri.split('?')[0]?.toLowerCase() ?? uri.toLowerCase();
  return withoutQuery.endsWith('.m3u8');
};

class StreamCache {
  private readonly warnUnavailable = createUnavailableWarner('StreamCache');

  async prefetch(source: ResolvableSource, headers?: StreamHeaders): Promise<void> {
    if (!NativeStreamCache?.prefetchFirstSegment) {
      this.warnUnavailable();
      return;
    }

    const resolved = resolveSource(source, headers);
    if (!isHlsManifestUrl(resolved.uri)) {
      return;
    }

    try {
      await NativeStreamCache.prefetchFirstSegment(resolved.uri, resolved.headers);
    } catch (error) {
      console.warn('[StreamCache] Prefetch failed', resolved.uri, error);
    }
  }

  async getStats(source?: ResolvableSource, headers?: StreamHeaders): Promise<StreamCacheStats | StreamSourceCacheStats> {
    if (typeof source === 'undefined') {
      if (!NativeStreamCache?.getCacheStats) {
        this.warnUnavailable();
        return DEFAULT_CACHE_STATS;
      }
      try {
        return await NativeStreamCache.getCacheStats();
      } catch {
        return DEFAULT_CACHE_STATS;
      }
    }

    if (!NativeStreamCache?.getStreamCacheStats) {
      this.warnUnavailable();
      return DEFAULT_STREAM_CACHE_STATS;
    }

    const resolved = resolveSource(source, headers);
    try {
      return await NativeStreamCache.getStreamCacheStats(resolved.uri, resolved.headers);
    } catch {
      return DEFAULT_STREAM_CACHE_STATS;
    }
  }

  async clear(): Promise<boolean> {
    if (!NativeStreamCache?.clearCache) {
      return true;
    }
    try {
      return await NativeStreamCache.clearCache();
    } catch {
      console.warn('[StreamCache] clear failed');
      return false;
    }
  }

  async configure(config: StreamCacheConfig): Promise<boolean> {
    if (!NativeStreamCache?.configureCache) {
      this.warnUnavailable();
      return false;
    }
    try {
      return await NativeStreamCache.configureCache(normalizeConfig(config));
    } catch {
      console.warn('[StreamCache] configure failed');
      return false;
    }
  }
}

const normalizeConfig = (config: StreamCacheConfig): StreamCacheConfig => {
  if (typeof config.maxBytes !== 'number') {
    return {};
  }
  if (!Number.isFinite(config.maxBytes) || config.maxBytes <= 0) {
    return {};
  }
  return { maxBytes: Math.floor(config.maxBytes) };
};

export const streamCache = new StreamCache();
