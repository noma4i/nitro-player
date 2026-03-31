"use strict";

import { NativeModules } from 'react-native';
const DEFAULT_CACHE_STATS = {
  totalSize: 0,
  fileCount: 0,
  maxSize: 5_368_709_120
};
const DEFAULT_STREAM_CACHE_STATS = {
  ...DEFAULT_CACHE_STATS,
  streamSize: 0,
  streamFileCount: 0
};
const NativeStreamCache = NativeModules?.NitroPlayStreamRuntime;
class StreamCache {
  didWarnUnavailable = false;
  warnUnavailable() {
    if (this.didWarnUnavailable) {
      return;
    }
    this.didWarnUnavailable = true;
    console.warn('[StreamCache] Native module not available');
  }
  async prefetch(source, headers) {
    if (!NativeStreamCache?.prefetchFirstSegment) {
      this.warnUnavailable();
      return;
    }
    const resolved = typeof source === 'string' ? {
      uri: source,
      headers
    } : source;
    try {
      await NativeStreamCache.prefetchFirstSegment(resolved.uri, resolved.headers);
    } catch (error) {
      console.warn('[StreamCache] Prefetch failed', resolved.uri, error);
    }
  }
  async getStats(source, headers) {
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
    const resolved = typeof source === 'string' ? {
      uri: source,
      headers
    } : source;
    try {
      return await NativeStreamCache.getStreamCacheStats(resolved.uri, resolved.headers);
    } catch {
      return DEFAULT_STREAM_CACHE_STATS;
    }
  }
  async clear() {
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
//# sourceMappingURL=streamCache.js.map