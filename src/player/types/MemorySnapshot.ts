import type { PreloadLevel } from './MemoryConfig';

export type MemoryRetentionState = 'cold' | 'metadata' | 'hot';

export interface MemorySnapshot {
  playerBytes: number;
  sourceBytes: number;
  totalBytes: number;
  preloadLevel: PreloadLevel;
  retentionState: MemoryRetentionState;
  isAttachedToView: boolean;
  isPlaying: boolean;
}
