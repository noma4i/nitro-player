import type { ResolvableSource } from '../source/resolveSource';
import type { StreamCacheStats, StreamHeaders, StreamSourceCacheStats } from './types';
declare class StreamCache {
    private readonly warnUnavailable;
    prefetch(source: ResolvableSource, headers?: StreamHeaders): Promise<void>;
    getStats(source?: ResolvableSource, headers?: StreamHeaders): Promise<StreamCacheStats | StreamSourceCacheStats>;
    clear(): Promise<boolean>;
}
export declare const streamCache: StreamCache;
export {};
//# sourceMappingURL=streamCache.d.ts.map