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

export interface StreamCacheNativeModule {
  prefetchFirstSegment: (url: string, headers?: StreamHeaders) => Promise<void>;
  getCacheStats: () => Promise<StreamCacheStats>;
  getStreamCacheStats: (url: string, headers?: StreamHeaders) => Promise<StreamSourceCacheStats>;
  clearCache: () => Promise<boolean>;
  clearPreview?: () => Promise<boolean>;
}
