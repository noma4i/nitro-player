"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resolvePlaybackContext = exports.NITRO_PLAYBACK_CONTEXTS = void 0;
/**
 * Named playback contexts owned by the library. Consumers select a context by
 * name; raw group/priority numbers are not part of the public surface.
 */
const NITRO_PLAYBACK_CONTEXTS = exports.NITRO_PLAYBACK_CONTEXTS = {
  ring: {
    group: 'ring',
    priority: 300,
    resume: 'automatic'
  },
  ambient: {
    group: 'ambient',
    priority: 325,
    resume: 'automatic'
  },
  hero: {
    group: 'hero',
    priority: 400,
    resume: 'manual'
  },
  overlay: {
    group: 'overlay',
    priority: 450,
    resume: 'automatic'
  },
  system: {
    group: 'system',
    priority: 475,
    resume: 'automatic'
  },
  exclusive: {
    group: 'exclusive',
    priority: 500,
    resume: 'automatic'
  }
};
const resolvePlaybackContext = name => NITRO_PLAYBACK_CONTEXTS[name];
exports.resolvePlaybackContext = resolvePlaybackContext;
//# sourceMappingURL=playbackContexts.js.map