"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.streamCache = void 0;
var _resolveSource = require("../source/resolveSource.js");
var _nativeStreamRuntime = require("../support/nativeStreamRuntime.js");
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
const NativeStreamCache = (0, _nativeStreamRuntime.getNativeStreamRuntime)();
const isHlsManifestUrl = uri => {
  const withoutQuery = uri.split('?')[0]?.toLowerCase() ?? uri.toLowerCase();
  return withoutQuery.endsWith('.m3u8');
};
class StreamCache {
  warnUnavailable = (0, _nativeStreamRuntime.createUnavailableWarner)('StreamCache');
  async prefetch(source, headers) {
    if (!NativeStreamCache?.prefetchFirstSegment) {
      this.warnUnavailable();
      return;
    }
    const resolved = (0, _resolveSource.resolveSource)(source, headers);
    if (!isHlsManifestUrl(resolved.uri)) {
      return;
    }
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
    const resolved = (0, _resolveSource.resolveSource)(source, headers);
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
const streamCache = exports.streamCache = new StreamCache();
//# sourceMappingURL=streamCache.js.map