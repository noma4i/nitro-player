import type { ResolvableSource } from '../source/resolveSource';
import type { StreamCacheConfig, StreamCacheStats, StreamHeaders, StreamNetworkThroughputEstimate, StreamSourceCacheStats } from './types';
export declare const DEFAULT_STREAM_CACHE_MAX_BYTES: number;
declare class StreamCache {
    private readonly warnUnavailable;
    prefetch(source: ResolvableSource, headers?: StreamHeaders): Promise<void>;
    getStats(source?: ResolvableSource, headers?: StreamHeaders): Promise<StreamCacheStats | StreamSourceCacheStats>;
    clear(): Promise<boolean>;
    /**
     * Estimates upstream network throughput from proxy ledger entries that were
     * backed by real CDN requests. Partial cache fills can slightly overstate the
     * value, so callers should use hysteresis instead of a one-sample switch.
     */
    getNetworkThroughputEstimate(): Promise<StreamNetworkThroughputEstimate | null>;
    configure(config: StreamCacheConfig): Promise<boolean>;
}
export declare const streamCache: StreamCache;
export {};
//# sourceMappingURL=streamCache.d.ts.map