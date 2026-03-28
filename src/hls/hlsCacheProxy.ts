import { NativeModules } from 'react-native';
import type {
  Headers,
  HlsCacheProxyNative,
  HlsCacheStats,
  HlsStreamCacheStats,
} from './types';

const DEFAULT_CACHE_STATS: HlsCacheStats = {
  totalSize: 0,
  fileCount: 0,
  maxSize: 5_368_709_120
};

const DEFAULT_STREAM_CACHE_STATS: HlsStreamCacheStats = {
  ...DEFAULT_CACHE_STATS,
  streamSize: 0,
  streamFileCount: 0,
};

const NativeProxy = NativeModules?.HlsCacheProxy as HlsCacheProxyNative | undefined;

class HlsCacheProxy {
  private defaultPort = 18181;
  private prefetchTimestamps = new Map<string, number>();
  private prefetchDedupMs = 60_000;
  private didWarnUnavailable = false;
  private didAutoStart = false;
  private isExplicitlyStopped = false;

  private warnUnavailable(): void {
    if (this.didWarnUnavailable) {
      return;
    }

    this.didWarnUnavailable = true;
    console.warn('[HlsCacheProxy] Native module not available, proxy disabled');
  }

  private ensureStarted(): void {
    if (this.isExplicitlyStopped || this.didAutoStart) {
      return;
    }

    if (!NativeProxy?.start) {
      this.warnUnavailable();
      return;
    }

    this.didAutoStart = true;

    try {
      NativeProxy.start(this.defaultPort);
    } catch (error) {
      this.didAutoStart = false;
      console.warn('[HlsCacheProxy] Failed to auto-start proxy', error);
    }
  }

  start(port?: number): void {
    if (!NativeProxy?.start) {
      this.warnUnavailable();
      return;
    }

    this.isExplicitlyStopped = false;
    const resolvedPort = typeof port === 'number' ? port : this.defaultPort;
    this.defaultPort = resolvedPort;

    try {
      NativeProxy.start(resolvedPort);
      this.didAutoStart = true;
    } catch (error) {
      this.didAutoStart = false;
      console.warn('[HlsCacheProxy] Failed to start proxy', error);
    }
  }

  stop(): void {
    this.isExplicitlyStopped = true;
    this.didAutoStart = false;
    NativeProxy?.stop?.();
  }

  getProxiedUrl(url: string, headers?: Headers): string {
    this.ensureStarted();

    if (!NativeProxy?.getProxiedUrl) {
      return url;
    }

    return NativeProxy.getProxiedUrl(url, headers);
  }

  async prefetchFirstSegment(url: string, headers?: Headers): Promise<void> {
    this.ensureStarted();

    if (!NativeProxy?.prefetchFirstSegment) {
      return;
    }
    const last = this.prefetchTimestamps.get(url);
    if (last && Date.now() - last < this.prefetchDedupMs) {
      return;
    }
    this.prefetchTimestamps.set(url, Date.now());
    this.evictStalePrefetchEntries();
    try {
      await NativeProxy.prefetchFirstSegment(url, headers);
    } catch (error) {
      console.warn('[HlsCacheProxy] Prefetch failed', url, error);
    }
  }

  async getCacheStats(): Promise<HlsCacheStats> {
    this.ensureStarted();

    if (!NativeProxy?.getCacheStats) {
      return DEFAULT_CACHE_STATS;
    }
    try {
      return await NativeProxy.getCacheStats();
    } catch {
      return DEFAULT_CACHE_STATS;
    }
  }

  async getStreamCacheStats(url: string): Promise<HlsStreamCacheStats> {
    this.ensureStarted();

    if (!NativeProxy?.getStreamCacheStats) {
      return DEFAULT_STREAM_CACHE_STATS;
    }
    try {
      return await NativeProxy.getStreamCacheStats(url);
    } catch {
      return DEFAULT_STREAM_CACHE_STATS;
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
  private evictStalePrefetchEntries(): void {
    if (this.prefetchTimestamps.size <= 500) {
      return;
    }
    const now = Date.now();
    for (const [key, ts] of this.prefetchTimestamps) {
      if (now - ts > this.prefetchDedupMs) {
        this.prefetchTimestamps.delete(key);
      }
    }
  }
}

export const hlsCacheProxy = new HlsCacheProxy();
