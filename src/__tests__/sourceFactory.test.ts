jest.mock('react-native', () => ({
  Image: {
    resolveAssetSource: jest.fn((asset: number) => ({ uri: `asset://${asset}` }))
  }
}));

const fromNitroPlayerConfig = jest.fn((config: unknown) => ({ name: 'NitroPlayerSource', config }));
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(() => ({
      fromNitroPlayerConfig
    }))
  }
}));

describe('sourceFactory', () => {
  beforeEach(() => {
    jest.resetModules();
    fromNitroPlayerConfig.mockClear();
  });

  it('passes raw source config to native factory without JS-side lifecycle resolution', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/video.mp4'
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      uri: 'https://cdn.example.com/video.mp4',
      headers: undefined,
      metadata: undefined,
      initialization: undefined,
      lifecycle: undefined,
      advanced: undefined
    });
  });

  it('preserves explicit lifecycle config for native resolution', () => {
    const { createNitroSource } = require('../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/feed-item.mp4',
      lifecycle: 'feed'
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: 'feed',
        advanced: undefined
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

});
