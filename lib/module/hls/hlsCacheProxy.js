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
const NativeProxy = NativeModules?.HlsCacheProxy;
class HlsCacheProxy {
  didWarnUnavailable = false;
  warnUnavailable() {
    if (this.didWarnUnavailable) {
      return;
    }
    this.didWarnUnavailable = true;
    console.warn('[HlsCacheProxy] Native module not available, proxy disabled');
  }
  start(port) {
    if (!NativeProxy?.start) {
      this.warnUnavailable();
      return;
    }
    try {
      NativeProxy.start(port);
    } catch (error) {
      console.warn('[HlsCacheProxy] Failed to start proxy', error);
    }
  }
  stop() {
    NativeProxy?.stop?.();
  }
  getProxiedUrl(url, headers) {
    if (!NativeProxy?.getProxiedUrl) {
      this.warnUnavailable();
      return url;
    }
    return NativeProxy.getProxiedUrl(url, headers);
  }
  async prefetchFirstSegment(url, headers) {
    if (!NativeProxy?.prefetchFirstSegment) {
      this.warnUnavailable();
      return;
    }
    try {
      await NativeProxy.prefetchFirstSegment(url, headers);
    } catch (error) {
      console.warn('[HlsCacheProxy] Prefetch failed', url, error);
    }
  }
  async getCacheStats() {
    if (!NativeProxy?.getCacheStats) {
      this.warnUnavailable();
      return DEFAULT_CACHE_STATS;
    }
    try {
      return await NativeProxy.getCacheStats();
    } catch {
      return DEFAULT_CACHE_STATS;
    }
  }
  async getStreamCacheStats(url) {
    if (!NativeProxy?.getStreamCacheStats) {
      this.warnUnavailable();
      return DEFAULT_STREAM_CACHE_STATS;
    }
    try {
      return await NativeProxy.getStreamCacheStats(url);
    } catch {
      return DEFAULT_STREAM_CACHE_STATS;
    }
  }
  async getThumbnail(url, headers) {
    if (!NativeProxy?.getThumbnailUrl) {
      this.warnUnavailable();
      return null;
    }
    try {
      const result = await NativeProxy.getThumbnailUrl(url, headers ?? {});
      return result ?? null;
    } catch {
      return null;
    }
  }
  async clearCache() {
    if (!NativeProxy?.clearCache) {
      return true;
    }
    try {
      return await NativeProxy.clearCache();
    } catch {
      console.warn('[HlsCacheProxy] clearCache failed');
      return false;
    }
  }
}
export const hlsCacheProxy = new HlsCacheProxy();
//# sourceMappingURL=hlsCacheProxy.js.map