import { resolveSource } from '../source/resolveSource';
import type { ResolvableSource } from '../source/resolveSource';
import { createUnavailableWarner, getNativeStreamRuntime } from '../support/nativeStreamRuntime';
import type {
  StreamCacheConfig,
  StreamCacheNativeModule,
  StreamCacheStats,
  StreamHeaders,
  StreamNetworkThroughputEstimate,
  StreamPlayersDiagnostics,
  StreamSourceCacheStats,
  StreamVariant
} from './types';

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
const MIN_PREFETCH_SEGMENTS = 1;
const MAX_PREFETCH_SEGMENTS = 6;

const isHlsManifestUrl = (uri: string): boolean => {
  const withoutQuery = uri.split('?')[0]?.toLowerCase() ?? uri.toLowerCase();
  return withoutQuery.endsWith('.m3u8');
};

class StreamCache {
  private readonly warnUnavailable = createUnavailableWarner('StreamCache');

  async prefetch(source: ResolvableSource, headers?: StreamHeaders): Promise<void> {
    if (!NativeStreamCache?.prefetchLeadingSegments) {
      this.warnUnavailable();
      return;
    }

    const resolved = resolveSource(source, headers);
    if (!isHlsManifestUrl(resolved.uri)) {
      return;
    }

    try {
      await NativeStreamCache.prefetchLeadingSegments(resolved.uri, resolved.headers);
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

  async getPlayersDiagnostics(): Promise<StreamPlayersDiagnostics | null> {
    if (!NativeStreamCache?.getPlayersDiagnostics) {
      return null;
    }
    try {
      return await NativeStreamCache.getPlayersDiagnostics();
    } catch {
      return null;
    }
  }

  /**
   * Estimates upstream network throughput from proxy ledger entries that were
   * backed by real CDN requests. Partial cache fills can slightly overstate the
   * value, so callers should use hysteresis instead of a one-sample switch.
   */
  async getNetworkThroughputEstimate(): Promise<StreamNetworkThroughputEstimate | null> {
    if (!NativeStreamCache?.getNetworkThroughputEstimate) {
      return null;
    }
    try {
      return await NativeStreamCache.getNetworkThroughputEstimate();
    } catch {
      return null;
    }
  }

  /**
   * Discovers HLS master-playlist variants. Pair this with
   * `configureSourcePolicy` to choose the playback cap used by future sources.
   */
  async getStreamVariants(source: ResolvableSource, headers?: StreamHeaders): Promise<StreamVariant[] | null> {
    const resolved = resolveSource(source, headers);
    if (!isHlsManifestUrl(resolved.uri)) {
      return [];
    }
    if (!NativeStreamCache?.getStreamVariants) {
      return null;
    }
    try {
      return await NativeStreamCache.getStreamVariants(resolved.uri, resolved.headers);
    } catch {
      return null;
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
  const normalized: StreamCacheConfig = {};

  if (typeof config.maxBytes === 'number' && Number.isFinite(config.maxBytes) && config.maxBytes > 0) {
    normalized.maxBytes = Math.floor(config.maxBytes);
  }

  if (typeof config.prefetchSegments === 'number' && Number.isFinite(config.prefetchSegments)) {
    const flooredSegments = Math.floor(config.prefetchSegments);
    normalized.prefetchSegments = Math.min(MAX_PREFETCH_SEGMENTS, Math.max(MIN_PREFETCH_SEGMENTS, flooredSegments));
  }

  return normalized;
};

export const streamCache = new StreamCache();
