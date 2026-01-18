export interface HlsCacheStats {
  totalSize: number;
  fileCount: number;
  maxSize: number;
}

export type Headers = Record<string, string>;

export interface HlsCacheProxyNative {
  start: (port?: number) => void;
  stop: () => void;
  getProxiedUrl: (url: string, headers?: Headers) => string;
  prefetchFirstSegment: (url: string, headers?: Headers) => Promise<void>;
  getCacheStats: () => Promise<HlsCacheStats>;
  clearCache: () => Promise<boolean>;
}
