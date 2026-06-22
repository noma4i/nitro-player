import type { ResolvableSource } from '../source/resolveSource';
import type { StreamCacheConfig, StreamCacheStats, StreamHeaders, StreamSourceCacheStats } from './types';
export declare const DEFAULT_STREAM_CACHE_MAX_BYTES: number;
declare class StreamCache {
    private readonly warnUnavailable;
    prefetch(source: ResolvableSource, headers?: StreamHeaders): Promise<void>;
    getStats(source?: ResolvableSource, headers?: StreamHeaders): Promise<StreamCacheStats | StreamSourceCacheStats>;
    clear(): Promise<boolean>;
    configure(config: StreamCacheConfig): Promise<boolean>;
}
export declare const streamCache: StreamCache;
export {};
//# sourceMappingURL=streamCache.d.ts.map