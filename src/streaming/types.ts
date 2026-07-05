export interface StreamCacheStats {
  totalSize: number;
  fileCount: number;
  maxSize: number;
}

export interface StreamSourceCacheStats extends StreamCacheStats {
  streamSize: number;
  streamFileCount: number;
}

export type StreamHeaders = Record<string, string>;

export interface StreamNetworkThroughputEstimate {
  bps: number;
  samples: number;
  newestAgeMs: number | null;
}

export interface StreamCacheConfig {
  maxBytes?: number;
  /**
   * Leading MEDIA segments to prefetch. The init segment is always fetched when
   * present and is not counted here. Native runtimes clamp this value to 1..6
   * and default to 2.
   */
  prefetchSegments?: number;
}
