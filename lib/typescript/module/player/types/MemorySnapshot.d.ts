import type { PreloadLevel, RetentionLevel } from './MemoryConfig.js';
export interface MemorySnapshot {
    playerBytes: number;
    sourceBytes: number;
    totalBytes: number;
    preloadLevel: PreloadLevel;
    retentionState: RetentionLevel;
    isAttachedToView: boolean;
    isPlaying: boolean;
    wantsToPlay: boolean;
    isRingSlot: boolean;
    isPinnedForResourcePressure: boolean;
}
//# sourceMappingURL=MemorySnapshot.d.ts.map