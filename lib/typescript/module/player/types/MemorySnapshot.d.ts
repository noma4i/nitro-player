import type { PreloadLevel, RetentionLevel } from './MemoryConfig';
export interface MemorySnapshot {
    playerBytes: number;
    sourceBytes: number;
    totalBytes: number;
    preloadLevel: PreloadLevel;
    retentionState: RetentionLevel;
    isAttachedToView: boolean;
    isPlaying: boolean;
}
//# sourceMappingURL=MemorySnapshot.d.ts.map