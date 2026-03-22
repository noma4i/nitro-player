jest.mock('react-native', () => ({
  Image: {
    resolveAssetSource: jest.fn(),
  },
  Platform: {
    select: jest.fn((config: Record<string, string>) => config.ios),
  },
}));

const fromUri = jest.fn((uri: string) => ({ uri }));
const fromNitroPlayerConfig = jest.fn((config: unknown) => ({ config }));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(() => ({
      fromUri,
      fromNitroPlayerConfig,
    })),
  },
}));

const getProxiedUrl = jest.fn((uri: string) => `proxied:${uri}`);

jest.mock('../hls/hlsCacheProxy', () => ({
  hlsCacheProxy: {
    getProxiedUrl,
  },
}));

describe('sourceFactory', () => {
  beforeEach(() => {
    jest.resetModules();
    fromUri.mockReset();
    fromUri.mockImplementation((uri: string) => ({ uri }));
    fromNitroPlayerConfig.mockReset();
    fromNitroPlayerConfig.mockImplementation((config: unknown) => ({ config }));
    getProxiedUrl.mockReset();
    getProxiedUrl.mockImplementation((uri: string) => `proxied:${uri}`);
  });

  it('proxies HLS manifest URLs with query/hash and case-insensitive extension', () => {
    const { createSourceFromUri } = require('../core/utils/sourceFactory');

    createSourceFromUri('https://cdn.example.com/live.M3U8?token=abc#main');

    expect(getProxiedUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/live.M3U8?token=abc#main',
      undefined
    );
    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      uri: 'proxied:https://cdn.example.com/live.M3U8?token=abc#main',
      initializeOnCreation: true,
      memoryConfig: {
        profile: 'balanced',
        preloadLevel: 'buffered',
        offscreenRetention: 'hot',
        pauseTrimDelayMs: 10000,
      },
    });
  });

  it('does not proxy non-HLS URLs', () => {
    const { createSourceFromUri } = require('../core/utils/sourceFactory');

    createSourceFromUri('https://cdn.example.com/video.mp4?token=abc');

    expect(getProxiedUrl).not.toHaveBeenCalled();
    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      uri: 'https://cdn.example.com/video.mp4?token=abc',
      initializeOnCreation: true,
      memoryConfig: {
        profile: 'balanced',
        preloadLevel: 'buffered',
        offscreenRetention: 'hot',
        pauseTrimDelayMs: 10000,
      },
    });
  });

  it('uses hot buffered defaults for feed profile sources', () => {
    const { createSourceFromNitroPlayerConfig } = require('../core/utils/sourceFactory');

    createSourceFromNitroPlayerConfig(
      {
        uri: 'https://cdn.example.com/feed-item.mp4',
        memoryConfig: {
          profile: 'feed',
        },
      },
      'feed'
    );

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      uri: 'https://cdn.example.com/feed-item.mp4',
      initializeOnCreation: true,
      memoryConfig: {
        profile: 'feed',
        preloadLevel: 'buffered',
        offscreenRetention: 'hot',
        pauseTrimDelayMs: 3000,
      },
    });
  });

  it('does not mutate the caller provided config object', () => {
    const { createSourceFromNitroPlayerConfig } = require('../core/utils/sourceFactory');

    const source = {
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { Authorization: 'Bearer token' },
    };

    const snapshot = JSON.parse(JSON.stringify(source));

    createSourceFromNitroPlayerConfig(source);

    expect(source).toEqual(snapshot);
    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      ...source,
      uri: 'proxied:https://cdn.example.com/live.m3u8',
      memoryConfig: {
        profile: 'balanced',
        preloadLevel: 'buffered',
        offscreenRetention: 'hot',
        pauseTrimDelayMs: 10000,
      },
      initializeOnCreation: true,
    });
  });

  it('getSourceIdentityKey returns the string itself for a string URI', () => {
    const { getSourceIdentityKey } = require('../core/utils/sourceFactory');

    expect(getSourceIdentityKey('https://cdn.example.com/video.mp4')).toBe(
      'https://cdn.example.com/video.mp4'
    );
  });

  it('getSourceIdentityKey returns String(number) for a number source', () => {
    const { getSourceIdentityKey } = require('../core/utils/sourceFactory');

    expect(getSourceIdentityKey(42)).toBe('42');
  });

  it('getSourceIdentityKey returns uri|useHlsProxy|profile|preloadLevel|offscreenRetention for config object', () => {
    const { getSourceIdentityKey } = require('../core/utils/sourceFactory');

    const key = getSourceIdentityKey({
      uri: 'https://cdn.example.com/live.m3u8',
      useHlsProxy: true,
      memoryConfig: {
        profile: 'feed',
        preloadLevel: 'buffered',
        offscreenRetention: 'hot',
      },
    });

    expect(key).toBe('https://cdn.example.com/live.m3u8|true|feed|buffered|hot');
  });
});
