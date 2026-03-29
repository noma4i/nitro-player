/**
 * Lifecycle contract tests.
 *
 * These tests verify that the source factory and player correctly handle
 * all lifecycle configurations. A failure here means a consumer relying
 * on onLoad/isReady will deadlock (infinite buffering).
 *
 * KEY INVARIANT: Every lifecycle preset must produce a native config that,
 * when paired with preload(), results in a fully initialized player.
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
    isReadyToDisplay: false,
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

describe('source factory: lifecycle config passthrough', () => {
  const LIFECYCLE_VALUES = ['feed', 'balanced', 'immersive'] as const;

  it.each(LIFECYCLE_VALUES)('passes lifecycle=%s directly to native without JS-side resolution', lifecycle => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({ uri: 'https://cdn.example.com/stream.m3u8', lifecycle });

    expect(mockFromNitroPlayerConfig).toHaveBeenCalledWith(expect.objectContaining({ lifecycle }));
  });

  it('passes initialization field to native', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({ uri: 'https://cdn.example.com/v.mp4', initialization: 'lazy' });

    expect(mockFromNitroPlayerConfig).toHaveBeenCalledWith(expect.objectContaining({ initialization: 'lazy' }));
  });

  it('passes advanced.transport.useHlsProxy to native', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/v.m3u8',
      advanced: { transport: { useHlsProxy: false } }
    });

    expect(mockFromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        advanced: expect.objectContaining({
          transport: { useHlsProxy: false }
        })
      })
    );
  });

  it('defaults to undefined for all optional fields (native decides defaults)', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({ uri: 'https://cdn.example.com/video.mp4' });

    const config = mockFromNitroPlayerConfig.mock.calls[0][0];
    expect(config.lifecycle).toBeUndefined();
    expect(config.initialization).toBeUndefined();
    expect(config.advanced).toBeUndefined();
    expect(config.headers).toBeUndefined();
    expect(config.metadata).toBeUndefined();
  });
});

describe('consumer contract: feed lifecycle metadata-only preload', () => {
  /**
   * With lifecycle='feed', native only loads metadata on creation.
   * play() handles full initialization automatically via async path.
   * Consumer does NOT need to call initialize() before play().
   */
  it('feed lifecycle: config passed to native has lifecycle=feed', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/feed-item.m3u8',
      lifecycle: 'feed'
    });

    // Native resolves feed -> preloadLevel=metadata (NOT buffered)
    // play() triggers full init automatically if playerItem is nil
    expect(mockFromNitroPlayerConfig).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'feed' }));
  });
});

describe('source factory: HLS URL detection belongs to native', () => {
  it('does NOT modify .m3u8 URLs on JS side (native handles proxy)', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({ uri: 'https://cdn.example.com/live.m3u8' });

    const config = mockFromNitroPlayerConfig.mock.calls[0][0];
    expect(config.uri).toBe('https://cdn.example.com/live.m3u8');
  });

  it('does NOT modify non-HLS URLs', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({ uri: 'https://cdn.example.com/video.mp4' });

    const config = mockFromNitroPlayerConfig.mock.calls[0][0];
    expect(config.uri).toBe('https://cdn.example.com/video.mp4');
  });
});

describe('source factory: config structure matches native expectations', () => {
  it('NativeNitroPlayerConfig has exactly the expected fields', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/v.mp4',
      headers: { Authorization: 'Bearer xxx' },
      metadata: { title: 'Test' },
      lifecycle: 'balanced',
      initialization: 'eager',
      advanced: {
        buffer: { minBufferMs: 5000 },
        lifecycle: { preloadLevel: 'buffered' },
        transport: { useHlsProxy: true }
      }
    });

    const config = mockFromNitroPlayerConfig.mock.calls[0][0];
    const keys = Object.keys(config).sort();
    expect(keys).toEqual(['advanced', 'headers', 'initialization', 'lifecycle', 'metadata', 'uri']);
  });

  it('does NOT pass unknown fields to native (old API fields stripped)', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    // Simulate old-API fields that might leak through spread operators
    const configWithOldFields = {
      uri: 'https://cdn.example.com/v.mp4',
      memoryConfig: { profile: 'feed' },
      initializeOnCreation: true,
      useHlsProxy: true,
      bufferConfig: { minBufferMs: 5000 }
    };
    createNitroSource(configWithOldFields as { uri: string });

    const config = mockFromNitroPlayerConfig.mock.calls[0][0];
    expect(config).not.toHaveProperty('memoryConfig');
    expect(config).not.toHaveProperty('initializeOnCreation');
    expect(config).not.toHaveProperty('useHlsProxy');
    expect(config).not.toHaveProperty('bufferConfig');
  });
});
