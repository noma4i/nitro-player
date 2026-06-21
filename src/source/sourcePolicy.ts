import type { BufferConfig } from '../player/types/BufferConfig';
import type {
  NitroSourcePolicy,
  NitroSourcePreviewConfig,
  NitroSourceRetentionConfig,
  NitroSourceStartup,
  NitroSourceTransportConfig
} from './types/NitroPlayerConfig';

export interface NitroSourcePolicyDefaults {
  startup?: NitroSourceStartup;
  buffer?: BufferConfig;
  retention?: NitroSourceRetentionConfig;
  transport?: NitroSourceTransportConfig;
  preview?: NitroSourcePreviewConfig;
}

export const DEFAULT_SOURCE_POLICY: NitroSourcePolicy = 'auto';

export const SOURCE_POLICY_DEFAULTS: Record<NitroSourcePolicy, NitroSourcePolicyDefaults> = {
  auto: {
    startup: 'eager',
    transport: { mode: 'auto' },
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
    transport: { mode: 'auto' },
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
    transport: { mode: 'auto' },
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
    transport: { mode: 'auto' },
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

export const isNitroSourcePolicy = (value: unknown): value is NitroSourcePolicy =>
  value === 'auto' || value === 'feed' || value === 'hero' || value === 'thumbnail' || value === 'manual';
