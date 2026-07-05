import type { HybridObject } from 'react-native-nitro-modules';

export interface NitroStreamCacheConfig {
  maxBytes?: number;
  prefetchSegments?: number;
}

export interface NitroStreamCacheStats {
  totalSize: number;
  fileCount: number;
  maxSize: number;
}

export interface NitroStreamSourceCacheStats {
  totalSize: number;
  fileCount: number;
  maxSize: number;
  streamSize: number;
  streamFileCount: number;
}

export interface NitroStreamNetworkThroughputEstimate {
  bps: number;
  samples: number;
  newestAgeMs: number | null;
}

export interface NitroStreamCache extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  prefetchLeadingSegments(url: string, headers?: Record<string, string>): Promise<void>;
  getCacheStats(): Promise<NitroStreamCacheStats>;
  getStreamCacheStats(url: string, headers?: Record<string, string>): Promise<NitroStreamSourceCacheStats>;
  getNetworkThroughputEstimate(): Promise<NitroStreamNetworkThroughputEstimate | null>;
  configureCache(options?: NitroStreamCacheConfig): Promise<boolean>;
  clearCache(): Promise<boolean>;
}
