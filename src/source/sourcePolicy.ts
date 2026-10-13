import type { BufferConfig } from '../player/types/BufferConfig';
import type {
  NitroSourcePolicy,
  NitroSourceRetentionConfig,
  NitroSourceStartup,
  NitroSourceTransportConfig
} from './types/NitroPlayerConfig';
import { SOURCE_POLICIES } from './types/NitroPlayerConfig';

export interface NitroSourcePolicyDefaults {
  startup?: NitroSourceStartup;
  buffer?: BufferConfig;
  retention?: NitroSourceRetentionConfig;
  transport?: NitroSourceTransportConfig;
}

export const DEFAULT_SOURCE_POLICY: NitroSourcePolicy = 'auto';

const SOURCE_POLICY_DEFAULTS: Record<NitroSourcePolicy, NitroSourcePolicyDefaults> = {
  auto: {
    startup: 'eager',
    transport: { mode: 'auto' },
    retention: {
      preload: 'buffered',
      offscreen: 'metadata',
      trimDelayMs: 10000
    },
  },
  feed: {
    startup: 'lazy',
    buffer: {
      preferredPeakBitRate: 6_000_000
    },
    transport: { mode: 'auto' },
    retention: {
      preload: 'metadata',
      offscreen: 'metadata',
      trimDelayMs: 4000
    },
  },
  hero: {
    startup: 'eager',
    transport: { mode: 'auto' },
    retention: {
      preload: 'buffered',
      offscreen: 'hot',
      trimDelayMs: 15000
    },
  },
  manual: {}
};

export const resolveSourcePolicyDefaults = (policy: NitroSourcePolicy): NitroSourcePolicyDefaults => SOURCE_POLICY_DEFAULTS[policy];

export const isNitroSourcePolicy = (value: unknown): value is NitroSourcePolicy =>
  typeof value === 'string' && (SOURCE_POLICIES as readonly string[]).includes(value);
