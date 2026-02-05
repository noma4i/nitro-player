jest.mock('react-native', () => ({
  Image: {
    resolveAssetSource: jest.fn(),
  },
  Platform: {
    select: jest.fn((config: Record<string, string>) => config.ios),
  },
}));

const fromUri = jest.fn((uri: string) => ({ uri }));
const fromVideoConfig = jest.fn((config: unknown) => ({ config }));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(() => ({
      fromUri,
      fromVideoConfig,
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
    fromVideoConfig.mockReset();
    fromVideoConfig.mockImplementation((config: unknown) => ({ config }));
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
    expect(fromVideoConfig).toHaveBeenCalledWith({
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
    expect(fromVideoConfig).toHaveBeenCalledWith({
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

  it('does not mutate the caller provided config object', () => {
    const { createSourceFromVideoConfig } = require('../core/utils/sourceFactory');

    const source = {
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { Authorization: 'Bearer token' },
      drm: {
        licenseServer: 'https://license.example.com',
      },
      externalSubtitles: [
        {
          uri: 'https://cdn.example.com/subtitles.vtt',
          label: 'English',
        },
      ],
    };

    const snapshot = JSON.parse(JSON.stringify(source));

    createSourceFromVideoConfig(source);

    expect(source).toEqual(snapshot);
    expect(fromVideoConfig).toHaveBeenCalledWith({
      ...source,
      uri: 'proxied:https://cdn.example.com/live.m3u8',
      drm: {
        licenseServer: 'https://license.example.com',
        type: 'fairplay',
      },
      externalSubtitles: [
        {
          uri: 'https://cdn.example.com/subtitles.vtt',
          label: 'English',
          type: 'auto',
          language: 'und',
        },
      ],
      memoryConfig: {
        profile: 'balanced',
        preloadLevel: 'buffered',
        offscreenRetention: 'hot',
        pauseTrimDelayMs: 10000,
      },
      initializeOnCreation: true,
    });
  });
});
