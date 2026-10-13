import type { NitroCacheStats } from '../bridge/nitro/NitroPlaybackRuntime.nitro.js';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig.js';
export type NitroPlaybackCacheConfig = Readonly<{
    maxBytes: number;
}>;
export type NitroPlaybackSubscription = Readonly<{
    remove(): void;
}>;
export type NitroPlaybackSuspension = Readonly<{
    release(): void;
}>;
export type { NitroCacheStats } from '../bridge/nitro/NitroPlaybackRuntime.nitro.js';
export declare const acquireExternalAudioSession: () => Readonly<{
    token: number;
    release(): void;
}>;
export declare const addNitroOutputDeviceLostListener: (listener: () => void) => NitroPlaybackSubscription;
export declare const addNitroForegroundListener: (listener: () => void) => NitroPlaybackSubscription;
export declare const addNitroPrefetchSettledListener: (listener: (uri: string) => void) => NitroPlaybackSubscription;
export declare const getNitroPlaybackCacheStats: () => Promise<NitroCacheStats>;
export declare const clearNitroPlaybackCache: () => Promise<void>;
/** Configures the HLS disk cache before the first cache operation, prefetch, or playback. */
export declare const configureNitroPlaybackCache: ({ maxBytes }: NitroPlaybackCacheConfig) => void;
export declare const prefetchNitroPlaybackSource: (source: NitroSourceInput, options?: {
    durationSeconds?: number;
}) => void;
export declare const cancelNitroPlaybackPrefetch: (source: NitroSourceInput) => void;
export declare const suspendNitroPlayback: (reason: string, allowGroups?: readonly string[]) => NitroPlaybackSuspension;
export declare const resetNitroPlayback: () => void;
//# sourceMappingURL=nativePlaybackRuntime.d.ts.map