/**
 * Source contract tests.
 *
 * These tests lock the v2 JS -> native config boundary:
 * JS must forward the explicit source DSL without lifecycle presets,
 * hidden fallback fields, or transport-side mutation.
 */

const mockPreload = jest.fn(() => Promise.resolve());
const mockInitialize = jest.fn(() => Promise.resolve());
const mockPlay = jest.fn();
const mockRelease = jest.fn();
const mockFromNitroPlayerConfig = jest.fn((config: Record<string, unknown>) => ({
  name: 'NitroPlayerSource',
  uri: config.uri,
  config
}));
const mockCreatePlayer = jest.fn((source: unknown) => ({
  source,
  eventEmitter: { clearAllListeners: jest.fn() },
  release: mockRelease,
  play: mockPlay,
  pause: jest.fn(),
  seekTo: jest.fn(),
  seekBy: jest.fn(),
  initialize: mockInitialize,
  preload: mockPreload,
  replaceSourceAsync: jest.fn(() => Promise.resolve()),
  clearSourceAsync: jest.fn(() => Promise.resolve()),
  playbackState: {
    status: 'idle',
    currentTime: 0,
    duration: 0,
    bufferDuration: 0,
    bufferedPosition: 0,
    rate: 1,
    isPlaying: false,
    isBuffering: false,
    isVisualReady: false,
    nativeTimestampMs: 0,
    error: null
  },
  memorySnapshot: {
    playerBytes: 0,
    sourceBytes: 0,
    totalBytes: 0,
    preloadLevel: 'none',
    retentionState: 'cold',
    isAttachedToView: false,
    isPlaying: false
  },
  volume: 1,
  muted: false,
  loop: false,
  rate: 1,
  currentTime: 0,
  mixAudioMode: 'mixWithOthers',
  ignoreSilentSwitchMode: 'auto',
  playInBackground: false,
  playWhenInactive: false
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Image: { resolveAssetSource: jest.fn((asset: number) => ({ uri: `asset://${asset}` })) }
}));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn((name: string) => {
      if (name === 'NitroPlayerSourceFactory') {
        return { fromNitroPlayerConfig: mockFromNitroPlayerConfig };
      }
      if (name === 'NitroPlayerFactory') {
        return { createPlayer: mockCreatePlayer };
      }
      return {};
    }),
    updateMemorySize: jest.fn()
  }
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('source factory: v2 passthrough contract', () => {
  const STARTUP_VALUES = ['eager', 'lazy'] as const;
  const TRANSPORT_VALUES = ['auto', 'direct', 'proxy'] as const;
  const PREVIEW_VALUES = ['listener', 'always', 'manual'] as const;

  it.each(STARTUP_VALUES)('passes startup=%s directly to native', startup => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({ uri: 'https://cdn.example.com/stream.m3u8', startup });

    expect(mockFromNitroPlayerConfig).toHaveBeenCalledWith(expect.objectContaining({ startup }));
  });

  it.each(TRANSPORT_VALUES)('passes transport.mode=%s directly to native', mode => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/stream.m3u8',
      transport: { mode }
    });

    expect(mockFromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: { mode }
      })
    );
  });

  it.each(PREVIEW_VALUES)('passes preview.mode=%s directly to native', mode => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/video.mp4',
      preview: { mode }
    });

    expect(mockFromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        preview: { mode }
      })
    );
  });

  it('passes preview.autoThumbnail directly to native', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/video.mp4',
      preview: { autoThumbnail: false }
    });

    expect(mockFromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        preview: { autoThumbnail: false }
      })
    );
  });

  it('passes explicit retention policy to native without JS-side preset resolution', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/feed-item.m3u8',
      retention: {
        preload: 'metadata',
        offscreen: 'metadata',
        trimDelayMs: 3000,
        feedPoolEligible: true
      }
    });

    expect(mockFromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        retention: {
          preload: 'metadata',
          offscreen: 'metadata',
          trimDelayMs: 3000,
          feedPoolEligible: true
        }
      })
    );
  });

  it('defaults to undefined for all optional v2 fields so native owns defaults', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({ uri: 'https://cdn.example.com/video.mp4' });

    const config = mockFromNitroPlayerConfig.mock.calls[0][0];
    expect(config.startup).toBeUndefined();
    expect(config.buffer).toBeUndefined();
    expect(config.retention).toBeUndefined();
    expect(config.transport).toBeUndefined();
    expect(config.preview).toBeUndefined();
    expect(config.headers).toBeUndefined();
    expect(config.metadata).toBeUndefined();
  });
});

describe('source factory: route ownership stays native', () => {
  it('does NOT modify HLS URLs on JS side', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({ uri: 'https://cdn.example.com/live.m3u8' });

    const config = mockFromNitroPlayerConfig.mock.calls[0][0];
    expect(config.uri).toBe('https://cdn.example.com/live.m3u8');
  });

  it('does NOT modify non-HLS URLs on JS side', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({ uri: 'https://cdn.example.com/video.mp4' });

    const config = mockFromNitroPlayerConfig.mock.calls[0][0];
    expect(config.uri).toBe('https://cdn.example.com/video.mp4');
  });
});

describe('source factory: native config structure', () => {
  it('NativeNitroPlayerConfig has exactly the expected v2 fields', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/v.mp4',
      headers: { Authorization: 'Bearer xxx' },
      metadata: { title: 'Test' },
      startup: 'eager',
      buffer: { minBufferMs: 5000 },
      retention: { preload: 'buffered', offscreen: 'hot', trimDelayMs: 10000 },
      transport: { mode: 'auto' },
      preview: { mode: 'listener', autoThumbnail: true, maxWidth: 480, maxHeight: 480, quality: 70 }
    });

    const config = mockFromNitroPlayerConfig.mock.calls[0][0];
    const keys = Object.keys(config).sort();
    expect(keys).toEqual(['buffer', 'headers', 'metadata', 'preview', 'retention', 'startup', 'transport', 'uri']);
  });

  it('does NOT pass removed legacy fields to native', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    const configWithLegacyFields = {
      uri: 'https://cdn.example.com/v.mp4',
      lifecycle: 'feed',
      initialization: 'lazy',
      advanced: { transport: { useHlsProxy: true } },
      memoryConfig: { profile: 'feed' },
      initializeOnCreation: true,
      useHlsProxy: true,
      bufferConfig: { minBufferMs: 5000 }
    };
    createNitroSource(configWithLegacyFields as { uri: string });

    const config = mockFromNitroPlayerConfig.mock.calls[0][0];
    expect(config).not.toHaveProperty('lifecycle');
    expect(config).not.toHaveProperty('initialization');
    expect(config).not.toHaveProperty('advanced');
    expect(config).not.toHaveProperty('memoryConfig');
    expect(config).not.toHaveProperty('initializeOnCreation');
    expect(config).not.toHaveProperty('useHlsProxy');
    expect(config).not.toHaveProperty('bufferConfig');
  });
});
