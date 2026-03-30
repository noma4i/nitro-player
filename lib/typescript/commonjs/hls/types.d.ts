export interface HlsCacheStats {
    totalSize: number;
    fileCount: number;
    maxSize: number;
}
export interface HlsStreamCacheStats extends HlsCacheStats {
    streamSize: number;
    streamFileCount: number;
}
export type Headers = Record<string, string>;
export interface HlsCacheProxyNative {
    start: (port?: number) => void;
    stop: () => void;
    getProxiedUrl: (url: string, headers?: Headers) => string;
    prefetchFirstSegment: (url: string, headers?: Headers) => Promise<void>;
    getCacheStats: () => Promise<HlsCacheStats>;
    getStreamCacheStats: (url: string) => Promise<HlsStreamCacheStats>;
    clearCache: () => Promise<boolean>;
    getThumbnailUrl: (url: string, headers?: Headers) => Promise<string | null>;
}
//# sourceMappingURL=types.d.ts.map