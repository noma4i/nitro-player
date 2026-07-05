"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resolveSourcePolicyDefaults = exports.isNitroSourcePolicy = exports.SOURCE_POLICY_DEFAULTS = exports.DEFAULT_SOURCE_POLICY = void 0;
var _NitroPlayerConfig = require("./types/NitroPlayerConfig.js");
const DEFAULT_SOURCE_POLICY = exports.DEFAULT_SOURCE_POLICY = 'auto';

// Native route resolution treats `transport.mode: 'auto'` as direct by default.
// Feed HLS sources keep proxy/cache routing through `retention.feedPoolEligible`.
const SOURCE_POLICY_DEFAULTS = exports.SOURCE_POLICY_DEFAULTS = {
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
    buffer: {
      preferredPeakBitRate: 6_000_000,
      preferredForwardBufferDurationMs: 12_000
    },
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
const resolveSourcePolicyDefaults = policy => SOURCE_POLICY_DEFAULTS[policy];
exports.resolveSourcePolicyDefaults = resolveSourcePolicyDefaults;
const isNitroSourcePolicy = value => typeof value === 'string' && _NitroPlayerConfig.SOURCE_POLICIES.includes(value);
exports.isNitroSourcePolicy = isNitroSourcePolicy;
//# sourceMappingURL=sourcePolicy.js.map