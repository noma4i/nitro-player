"use strict";

import { SOURCE_POLICIES } from "./types/NitroPlayerConfig.js";
export const DEFAULT_SOURCE_POLICY = 'auto';
export const SOURCE_POLICY_DEFAULTS = {
  auto: {
    startup: 'eager',
    transport: {
      mode: 'auto'
    },
    retention: {
      preload: 'buffered',
      offscreen: 'metadata',
      trimDelayMs: 10000,
      feedPoolEligible: false
    },
    preview: {
      mode: 'listener',
      autoThumbnail: true,
      maxWidth: 480,
      maxHeight: 480,
      quality: 70
    }
  },
  feed: {
    startup: 'lazy',
    transport: {
      mode: 'auto'
    },
    retention: {
      preload: 'metadata',
      offscreen: 'metadata',
      trimDelayMs: 4000,
      feedPoolEligible: true
    },
    preview: {
      mode: 'listener',
      autoThumbnail: true,
      maxWidth: 512,
      maxHeight: 512,
      quality: 72
    }
  },
  hero: {
    startup: 'eager',
    transport: {
      mode: 'auto'
    },
    retention: {
      preload: 'buffered',
      offscreen: 'hot',
      trimDelayMs: 15000,
      feedPoolEligible: false
    },
    preview: {
      mode: 'always',
      autoThumbnail: true,
      maxWidth: 640,
      maxHeight: 360,
      quality: 80
    }
  },
  thumbnail: {
    startup: 'lazy',
    transport: {
      mode: 'auto'
    },
    retention: {
      preload: 'none',
      offscreen: 'cold',
      trimDelayMs: 0,
      feedPoolEligible: false
    },
    preview: {
      mode: 'manual',
      autoThumbnail: false,
      maxWidth: 480,
      maxHeight: 480,
      quality: 70
    }
  },
  manual: {}
};
export const isNitroSourcePolicy = value => typeof value === 'string' && SOURCE_POLICIES.includes(value);
//# sourceMappingURL=sourcePolicy.js.map