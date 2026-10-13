"use strict";

import { SOURCE_POLICIES } from "./types/NitroPlayerConfig.js";
export const DEFAULT_SOURCE_POLICY = 'auto';
const SOURCE_POLICY_DEFAULTS = {
  auto: {
    startup: 'eager',
    transport: {
      mode: 'auto'
    },
    retention: {
      preload: 'buffered',
      offscreen: 'metadata',
      trimDelayMs: 10000
    }
  },
  feed: {
    startup: 'lazy',
    buffer: {
      preferredPeakBitRate: 6_000_000
    },
    transport: {
      mode: 'auto'
    },
    retention: {
      preload: 'metadata',
      offscreen: 'metadata',
      trimDelayMs: 4000
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
      trimDelayMs: 15000
    }
  },
  manual: {}
};
export const resolveSourcePolicyDefaults = policy => SOURCE_POLICY_DEFAULTS[policy];
export const isNitroSourcePolicy = value => typeof value === 'string' && SOURCE_POLICIES.includes(value);
//# sourceMappingURL=sourcePolicy.js.map