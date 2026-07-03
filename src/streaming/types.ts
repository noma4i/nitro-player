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

export interface StreamVariant {
  bandwidth: number;
  averageBandwidth: number | null;
  width: number | null;
  height: number | null;
  codecs: string | null;
  uri: string;
}

export interface StreamNetworkThroughputEstimate {
  bps: number;
  samples: number;
  newestAgeMs: number | null;
}

export interface StreamProxyLedgerEntry {
  urlTail: string;
  isPlaylist: boolean;
  tStartMs: number;
  tFirstByteMs: number | null;
  tDoneMs: number | null;
  bytes: number;
  usedNetwork: boolean;
}

export interface StreamPlayerAccessLogDiagnostics {
  numberOfStalls: number;
  indicatedBitrate: number;
  observedBitrate: number;
  switchBitrate: number;
  startupTime: number;
  durationWatched: number;
  downloadOverdue: number;
  numberOfBytesTransferred: number;
  uri: string | null;
}

export interface StreamPlayerDiagnostics {
  automaticallyWaitsToMinimizeStalling: boolean;
  playbackWatchdogAttempts: number;
  cachedTimeControlStatus: string;
  sourceUri: string | null;
  accessLog: StreamPlayerAccessLogDiagnostics | null;
}

export interface StreamPlayersDiagnostics {
  capturedAt: number;
  players: StreamPlayerDiagnostics[];
  proxyLedger: StreamProxyLedgerEntry[];
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

export interface StreamCacheNativeModule {
  prefetchLeadingSegments: (url: string, headers?: StreamHeaders) => Promise<void>;
  getCacheStats: () => Promise<StreamCacheStats>;
  getStreamCacheStats: (url: string, headers?: StreamHeaders) => Promise<StreamSourceCacheStats>;
  getPlayersDiagnostics?: () => Promise<StreamPlayersDiagnostics>;
  getStreamVariants?: (url: string, headers?: StreamHeaders) => Promise<StreamVariant[]>;
  getNetworkThroughputEstimate?: () => Promise<StreamNetworkThroughputEstimate>;
  configureCache?: (options?: StreamCacheConfig) => Promise<boolean>;
  clearCache: () => Promise<boolean>;
  clearPreview?: () => Promise<boolean>;
}
