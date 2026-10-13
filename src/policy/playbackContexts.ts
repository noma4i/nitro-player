import type { NitroPlaybackPolicy } from '../surface/NitroPlaybackPolicy';

/**
 * Named playback contexts owned by the library. Consumers select a context by
 * name; raw group/priority numbers are not part of the public surface.
 */
export const NITRO_PLAYBACK_CONTEXTS = {
  ring: { group: 'ring', priority: 300, resume: 'automatic' },
  ambient: { group: 'ambient', priority: 325, resume: 'automatic' },
  hero: { group: 'hero', priority: 400, resume: 'manual' },
  overlay: { group: 'overlay', priority: 450, resume: 'automatic' },
  system: { group: 'system', priority: 475, resume: 'automatic' },
  exclusive: { group: 'exclusive', priority: 500, resume: 'automatic' }
} as const satisfies Record<string, NitroPlaybackPolicy>;

export type NitroPlaybackContextName = keyof typeof NITRO_PLAYBACK_CONTEXTS;

export const resolvePlaybackContext = (name: NitroPlaybackContextName): NitroPlaybackPolicy => NITRO_PLAYBACK_CONTEXTS[name];
