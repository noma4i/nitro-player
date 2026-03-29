jest.mock('react-native', () => ({
  Image: {
    resolveAssetSource: jest.fn((asset: number) => ({ uri: `asset://${asset}` }))
  }
}));

const fromNitroPlayerConfig = jest.fn((config: unknown) => ({ name: 'NitroPlayerSource', config }));
const getProxiedUrl = jest.fn((uri: string) => `proxied:${uri}`);

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(() => ({
      fromNitroPlayerConfig
    }))
  }
}));

jest.mock('../hls/hlsCacheProxy', () => ({
  hlsCacheProxy: {
    getProxiedUrl
  }
}));

describe('sourceFactory', () => {
  beforeEach(() => {
    jest.resetModules();
    fromNitroPlayerConfig.mockClear();
    getProxiedUrl.mockClear();
  });

  it('normalizes default balanced lifecycle for object source configs', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/video.mp4'
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      uri: 'https://cdn.example.com/video.mp4',
      headers: undefined,
      metadata: undefined,
      initialization: 'eager',
      lifecycle: 'balanced',
      advanced: {
        buffer: undefined,
        transport: {
          useHlsProxy: true
        },
        lifecycle: {
          preloadLevel: 'buffered',
          offscreenRetention: 'hot',
          trimDelayMs: 10000
        }
      }
    });
  });

  it('uses metadata-oriented defaults for feed lifecycle', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/feed-item.mp4',
      lifecycle: 'feed'
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: 'feed',
        advanced: expect.objectContaining({
          lifecycle: {
            preloadLevel: 'metadata',
            offscreenRetention: 'metadata',
            trimDelayMs: 3000
          }
        })
      })
    );
  });

  it('maps advanced lifecycle and transport overrides', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/live.m3u8',
      initialization: 'lazy',
      advanced: {
        transport: {
          useHlsProxy: false
        },
        lifecycle: {
          preloadLevel: 'none',
          offscreenRetention: 'cold',
          trimDelayMs: 500
        }
      }
    });

    expect(getProxiedUrl).not.toHaveBeenCalled();
    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'https://cdn.example.com/live.m3u8',
        initialization: 'lazy',
        advanced: expect.objectContaining({
          transport: {
            useHlsProxy: false
          },
          lifecycle: {
            preloadLevel: 'none',
            offscreenRetention: 'cold',
            trimDelayMs: 500
          }
        })
      })
    );
  });

  it('proxies HLS manifests when transport override is not disabled', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/live.M3U8?token=abc#main',
      headers: {
        Authorization: 'Bearer token'
      }
    });

    expect(getProxiedUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/live.M3U8?token=abc#main',
      { Authorization: 'Bearer token' }
    );
  });

  it('supports React Native asset sources inside NitroSourceConfig', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 42
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'asset://42'
      })
    );
  });

  it('returns stable identity keys for config values and per-object identity for Nitro sources', () => {
    const { getSourceIdentityKey } = require('../core/utils/sourceFactory');

    const firstKey = getSourceIdentityKey({
      uri: 'https://cdn.example.com/video.mp4',
      headers: { Authorization: 'one' }
    });
    const secondKey = getSourceIdentityKey({
      uri: 'https://cdn.example.com/video.mp4',
      headers: { Authorization: 'two' }
    });

    const nitroSourceA = { name: 'NitroPlayerSource' };
    const nitroSourceB = { name: 'NitroPlayerSource' };

    expect(firstKey).not.toBe(secondKey);
    expect(getSourceIdentityKey(nitroSourceA)).not.toBe(getSourceIdentityKey(nitroSourceB));
    expect(getSourceIdentityKey(nitroSourceA)).toBe(getSourceIdentityKey(nitroSourceA));
  });
});
