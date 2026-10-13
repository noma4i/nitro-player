"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resolveSourcePolicyDefaults = exports.isNitroSourcePolicy = exports.DEFAULT_SOURCE_POLICY = void 0;
var _NitroPlayerConfig = require("./types/NitroPlayerConfig.js");
const DEFAULT_SOURCE_POLICY = exports.DEFAULT_SOURCE_POLICY = 'auto';
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
const resolveSourcePolicyDefaults = policy => SOURCE_POLICY_DEFAULTS[policy];
exports.resolveSourcePolicyDefaults = resolveSourcePolicyDefaults;
const isNitroSourcePolicy = value => typeof value === 'string' && _NitroPlayerConfig.SOURCE_POLICIES.includes(value);
exports.isNitroSourcePolicy = isNitroSourcePolicy;
//# sourceMappingURL=sourcePolicy.js.map