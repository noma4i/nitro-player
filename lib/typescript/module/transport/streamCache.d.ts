import type { StreamCacheStats, StreamHeaders, StreamSourceCacheStats } from './types';
declare class StreamCache {
    private didWarnUnavailable;
    private warnUnavailable;
    prefetch(source: {
        uri: string;
        headers?: StreamHeaders;
    } | string, headers?: StreamHeaders): Promise<void>;
    getStats(source?: {
        uri: string;
        headers?: StreamHeaders;
    } | string, headers?: StreamHeaders): Promise<StreamCacheStats | StreamSourceCacheStats>;
    clear(): Promise<boolean>;
}
export declare const streamCache: StreamCache;
export {};
//# sourceMappingURL=streamCache.d.ts.map