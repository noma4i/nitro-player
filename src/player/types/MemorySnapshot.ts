import type { PreloadLevel, RetentionLevel } from './MemoryConfig';

export interface MemorySnapshot {
  /**
   * Estimated native player allocation, not a precise heap measurement.
   */
  playerBytes: number;
  /**
   * Estimated source-side allocation, not a precise heap measurement.
   */
  sourceBytes: number;
  /**
   * Sum of the estimated player and source byte counters.
   */
  totalBytes: number;
  preloadLevel: PreloadLevel;
  retentionState: RetentionLevel;
  isAttachedToView: boolean;
  isPlaying: boolean;
  wantsToPlay: boolean;
  isFeedPoolEligible: boolean;
  isPinnedForFeedPool: boolean;
  isPinnedForResourcePressure: boolean;
}
