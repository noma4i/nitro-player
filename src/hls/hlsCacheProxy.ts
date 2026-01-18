import { NativeModules } from 'react-native';
import type { Headers, HlsCacheProxyNative, HlsCacheStats } from './types';

const DEFAULT_CACHE_STATS: HlsCacheStats = {
  totalSize: 0,
  fileCount: 0,
  maxSize: 5_368_709_120
};

const NativeProxy = NativeModules?.HlsCacheProxy as HlsCacheProxyNative | undefined;

class HlsCacheProxy {
  private prefetchTimestamps = new Map<string, number>();
  private prefetchDedupMs = 60_000;

  start(port?: number): void {
    if (!NativeProxy?.start) {
      console.warn('[HlsCacheProxy] Native module not available, proxy disabled');
      return;
    }
    const resolvedPort = typeof port === 'number' ? port : 18181;
    NativeProxy.start(resolvedPort);
  }

  stop(): void {
    NativeProxy?.stop?.();
  }

  getProxiedUrl(url: string, headers?: Headers): string {
    if (!NativeProxy?.getProxiedUrl) {
      return url;
    }
    return NativeProxy.getProxiedUrl(url, headers);
  }

  async prefetchFirstSegment(url: string, headers?: Headers): Promise<void> {
    if (!NativeProxy?.prefetchFirstSegment) {
      return;
    }
    const last = this.prefetchTimestamps.get(url);
    if (last && Date.now() - last < this.prefetchDedupMs) {
      return;
    }
    this.prefetchTimestamps.set(url, Date.now());
    try {
      await NativeProxy.prefetchFirstSegment(url, headers);
    } catch (error) {
      console.warn('[HlsCacheProxy] Prefetch failed', url, error);
    }
  }

  async getCacheStats(): Promise<HlsCacheStats> {
    if (!NativeProxy?.getCacheStats) {
      return DEFAULT_CACHE_STATS;
    }
    try {
      return await NativeProxy.getCacheStats();
    } catch {
      return DEFAULT_CACHE_STATS;
    }
  }

  async clearCache(): Promise<boolean> {
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
