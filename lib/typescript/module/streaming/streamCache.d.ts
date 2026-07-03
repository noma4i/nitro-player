import type { ResolvableSource } from '../source/resolveSource';
import type { StreamCacheConfig, StreamCacheStats, StreamHeaders, StreamNetworkThroughputEstimate, StreamPlayersDiagnostics, StreamSourceCacheStats, StreamVariant } from './types';
export declare const DEFAULT_STREAM_CACHE_MAX_BYTES: number;
declare class StreamCache {
    private readonly warnUnavailable;
    prefetch(source: ResolvableSource, headers?: StreamHeaders): Promise<void>;
    getStats(source?: ResolvableSource, headers?: StreamHeaders): Promise<StreamCacheStats | StreamSourceCacheStats>;
    clear(): Promise<boolean>;
    getPlayersDiagnostics(): Promise<StreamPlayersDiagnostics | null>;
    /**
     * Estimates upstream network throughput from proxy ledger entries that were
     * backed by real CDN requests. Partial cache fills can slightly overstate the
     * value, so callers should use hysteresis instead of a one-sample switch.
     */
    getNetworkThroughputEstimate(): Promise<StreamNetworkThroughputEstimate | null>;
    /**
     * Discovers HLS master-playlist variants. Pair this with
     * `configureSourcePolicy` to choose the playback cap used by future sources.
     */
    getStreamVariants(source: ResolvableSource, headers?: StreamHeaders): Promise<StreamVariant[] | null>;
    configure(config: StreamCacheConfig): Promise<boolean>;
}
export declare const streamCache: StreamCache;
export {};
//# sourceMappingURL=streamCache.d.ts.map