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

  it('passes raw source config to native factory without JS-side resolution', () => {
    const { createNitroSource } = require('../../../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/video.mp4'
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      uri: 'https://cdn.example.com/video.mp4',
      headers: undefined,
      metadata: undefined,
      startup: undefined,
      buffer: undefined,
      retention: undefined,
      transport: undefined,
      preview: undefined
    });
  });

  it('preserves explicit startup and retention config for native resolution', () => {
    const { createNitroSource } = require('../../../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/feed-item.mp4',
      startup: 'lazy',
      retention: {
        preload: 'metadata',
        offscreen: 'metadata',
        trimDelayMs: 3000,
        feedPoolEligible: true
      }
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        startup: 'lazy',
        retention: {
          preload: 'metadata',
          offscreen: 'metadata',
          trimDelayMs: 3000,
          feedPoolEligible: true
        }
      })
    );
  });

  it('maps buffer, transport and preview overrides', () => {
    const { createNitroSource } = require('../../../core/utils/sourceFactory');

    createNitroSource({
      uri: 'https://cdn.example.com/live.m3u8',
      startup: 'lazy',
      buffer: {
        minBufferMs: 5000
      },
      transport: {
        mode: 'direct'
      },
      preview: {
        mode: 'always',
        autoThumbnail: false,
        maxWidth: 320,
        maxHeight: 180,
        quality: 60
      }
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'https://cdn.example.com/live.m3u8',
        startup: 'lazy',
        buffer: {
          minBufferMs: 5000
        },
        transport: {
          mode: 'direct'
        },
        preview: {
          mode: 'always',
          autoThumbnail: false,
          maxWidth: 320,
          maxHeight: 180,
          quality: 60
        }
      })
    );
  });

  it('supports React Native asset sources inside NitroSourceConfig', () => {
    const { createNitroSource } = require('../../../core/utils/sourceFactory');

    createNitroSource({
      uri: 42
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'asset://42'
      })
    );
  });

  it('rejects an unknown startup value before reaching the native factory', () => {
    const { createNitroSource } = require('../../../core/utils/sourceFactory');

    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', startup: 'turbo' as never })).toThrow(/Invalid startup/);
    expect(fromNitroPlayerConfig).not.toHaveBeenCalled();
  });

  it('rejects an unknown transport mode', () => {
    const { createNitroSource } = require('../../../core/utils/sourceFactory');

    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', transport: { mode: 'tunnel' as never } })).toThrow(/Invalid transport\.mode/);
    expect(fromNitroPlayerConfig).not.toHaveBeenCalled();
  });

  it('rejects an unknown preview mode and retention preload level', () => {
    const { createNitroSource } = require('../../../core/utils/sourceFactory');

    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', preview: { mode: 'eager' as never } })).toThrow(/Invalid preview\.mode/);
    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', retention: { preload: 'all' as never } })).toThrow(/Invalid retention\.preload/);
  });

  it('rejects a malformed headers shape', () => {
    const { createNitroSource } = require('../../../core/utils/sourceFactory');

    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', headers: ['x'] as never })).toThrow(/Invalid headers/);
  });

});
