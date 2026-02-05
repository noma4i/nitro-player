export type MemoryProfile = 'feed' | 'balanced' | 'immersive';

export type PreloadLevel = 'none' | 'metadata' | 'buffered';

export type OffscreenRetention = 'cold' | 'metadata' | 'hot';

export interface MemoryConfig {
  /**
   * High-level memory profile for the player lifecycle.
   * Explicit fields below override the selected profile.
   */
  profile?: MemoryProfile;
  /**
   * How aggressively the source should be preloaded.
   */
  preloadLevel?: PreloadLevel;
  /**
   * How much native state should be retained after the view goes offscreen.
   */
  offscreenRetention?: OffscreenRetention;
  /**
   * Delay before trimming an offscreen, paused player.
   * `Infinity` disables the delayed trim.
   */
  pauseTrimDelayMs?: number;
}
