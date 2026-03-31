import { NativeModules } from 'react-native';
import type {
  StreamCacheNativeModule,
  StreamCacheStats,
  StreamHeaders,
  StreamSourceCacheStats,
} from './types';

const DEFAULT_CACHE_STATS: StreamCacheStats = {
  totalSize: 0,
  fileCount: 0,
  maxSize: 5_368_709_120
};

const DEFAULT_STREAM_CACHE_STATS: StreamSourceCacheStats = {
  ...DEFAULT_CACHE_STATS,
  streamSize: 0,
  streamFileCount: 0
};

const NativeStreamCache = NativeModules?.NitroPlayStreamRuntime as StreamCacheNativeModule | undefined;

class StreamCache {
  private didWarnUnavailable = false;

  private warnUnavailable(): void {
    if (this.didWarnUnavailable) {
      return;
    }

    this.didWarnUnavailable = true;
    console.warn('[StreamCache] Native module not available');
  }

  async prefetch(source: { uri: string; headers?: StreamHeaders } | string, headers?: StreamHeaders): Promise<void> {
    if (!NativeStreamCache?.prefetchFirstSegment) {
      this.warnUnavailable();
      return;
    }

    const resolved = typeof source === 'string'
      ? { uri: source, headers }
      : source;

    try {
      await NativeStreamCache.prefetchFirstSegment(resolved.uri, resolved.headers);
    } catch (error) {
      console.warn('[StreamCache] Prefetch failed', resolved.uri, error);
    }
  }

  async getStats(source?: { uri: string; headers?: StreamHeaders } | string, headers?: StreamHeaders): Promise<StreamCacheStats | StreamSourceCacheStats> {
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

    const resolved = typeof source === 'string'
      ? { uri: source, headers }
      : source;
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
}

export const streamCache = new StreamCache();
