import type { Headers, HlsCacheStats, HlsStreamCacheStats } from './types';
declare class HlsCacheProxy {
    private didWarnUnavailable;
    private warnUnavailable;
    start(port?: number): void;
    stop(): void;
    getProxiedUrl(url: string, headers?: Headers): string;
    prefetchFirstSegment(url: string, headers?: Headers): Promise<void>;
    getCacheStats(): Promise<HlsCacheStats>;
    getStreamCacheStats(url: string): Promise<HlsStreamCacheStats>;
    getThumbnail(url: string, headers?: Headers): Promise<string | null>;
    clearCache(): Promise<boolean>;
}
export declare const hlsCacheProxy: HlsCacheProxy;
export {};
//# sourceMappingURL=hlsCacheProxy.d.ts.map