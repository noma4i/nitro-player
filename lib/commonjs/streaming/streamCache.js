"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.streamCache = exports.DEFAULT_STREAM_CACHE_MAX_BYTES = void 0;
var _resolveSource = require("../source/resolveSource.js");
var _nativeNitroObject = require("../support/nativeNitroObject.js");
const DEFAULT_STREAM_CACHE_MAX_BYTES = exports.DEFAULT_STREAM_CACHE_MAX_BYTES = 4 * 1024 * 1024 * 1024;
const DEFAULT_CACHE_STATS = {
  totalSize: 0,
  fileCount: 0,
  maxSize: DEFAULT_STREAM_CACHE_MAX_BYTES
};
const DEFAULT_STREAM_CACHE_STATS = {
  ...DEFAULT_CACHE_STATS,
  streamSize: 0,
  streamFileCount: 0
};
const NativeStreamCache = (0, _nativeNitroObject.createNativeNitroObject)('NitroStreamCache');
const MIN_PREFETCH_SEGMENTS = 1;
const MAX_PREFETCH_SEGMENTS = 6;
const isHlsManifestUrl = uri => {
  const withoutQuery = uri.split('?')[0]?.toLowerCase() ?? uri.toLowerCase();
  return withoutQuery.endsWith('.m3u8');
};
class StreamCache {
  warnUnavailable = (0, _nativeNitroObject.createUnavailableWarner)('StreamCache');
  async prefetch(source, headers) {
    if (!NativeStreamCache) {
      this.warnUnavailable();
      return;
    }
    const resolved = (0, _resolveSource.resolveSource)(source, headers);
    if (!isHlsManifestUrl(resolved.uri)) {
      return;
    }
    try {
      await NativeStreamCache.prefetchLeadingSegments(resolved.uri, resolved.headers);
    } catch (error) {
      console.warn('[StreamCache] Prefetch failed', resolved.uri, error);
    }
  }
  async getStats(source, headers) {
    if (typeof source === 'undefined') {
      if (!NativeStreamCache) {
        this.warnUnavailable();
        return DEFAULT_CACHE_STATS;
      }
      try {
        return await NativeStreamCache.getCacheStats();
      } catch {
        return DEFAULT_CACHE_STATS;
      }
    }
    if (!NativeStreamCache) {
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
    if (!NativeStreamCache) {
      return true;
    }
    try {
      return await NativeStreamCache.clearCache();
    } catch {
      console.warn('[StreamCache] clear failed');
      return false;
    }
  }

  /**
   * Estimates upstream network throughput from proxy ledger entries that were
   * backed by real CDN requests. Partial cache fills can slightly overstate the
   * value, so callers should use hysteresis instead of a one-sample switch.
   */
  async getNetworkThroughputEstimate() {
    if (!NativeStreamCache) {
      return null;
    }
    try {
      return await NativeStreamCache.getNetworkThroughputEstimate();
    } catch {
      return null;
    }
  }
  async configure(config) {
    if (!NativeStreamCache) {
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
const normalizeConfig = config => {
  const normalized = {};
  if (typeof config.maxBytes === 'number' && Number.isFinite(config.maxBytes) && config.maxBytes > 0) {
    normalized.maxBytes = Math.floor(config.maxBytes);
  }
  if (typeof config.prefetchSegments === 'number' && Number.isFinite(config.prefetchSegments)) {
    const flooredSegments = Math.floor(config.prefetchSegments);
    normalized.prefetchSegments = Math.min(MAX_PREFETCH_SEGMENTS, Math.max(MIN_PREFETCH_SEGMENTS, flooredSegments));
  }
  return normalized;
};
const streamCache = exports.streamCache = new StreamCache();
//# sourceMappingURL=streamCache.js.map