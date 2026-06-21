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

  it('applies safe auto policy defaults before reaching the native factory', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    createNativeNitroSource({
      uri: 'https://cdn.example.com/video.mp4'
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      uri: 'https://cdn.example.com/video.mp4',
      headers: undefined,
      metadata: undefined,
      startup: 'eager',
      buffer: undefined,
      retention: {
        preload: 'buffered',
        offscreen: 'metadata',
        trimDelayMs: 10000,
        feedPoolEligible: false
      },
      transport: { mode: 'auto' },
      preview: {
        mode: 'listener',
        autoThumbnail: true,
        maxWidth: 480,
        maxHeight: 480,
        quality: 70
      }
    });
  });

  it('preserves explicit startup and retention config for native resolution', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    createNativeNitroSource({
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

  it('expands feed policy into consumer-safe feed defaults', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    createNativeNitroSource({
      uri: 'https://cdn.example.com/feed-item.m3u8',
      policy: 'feed'
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
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
      })
    );
  });

  it('maps buffer, transport and preview overrides', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    createNativeNitroSource({
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

  it('preserves the complete v2 source DSL for native source ownership', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    createNativeNitroSource({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: {
        Authorization: 'Bearer token',
        'X-Feed': 'home'
      },
      metadata: {
        title: 'Home Stream',
        subtitle: 'feed row',
        description: 'consumer feed playback',
        artist: 'creator',
        imageUri: 'https://cdn.example.com/poster.jpg'
      },
      startup: 'lazy',
      buffer: {
        minBufferMs: 2500,
        maxBufferMs: 30000,
        bufferForPlaybackMs: 800,
        bufferForPlaybackAfterRebufferMs: 1500
      },
      retention: {
        preload: 'metadata',
        offscreen: 'metadata',
        trimDelayMs: 6000,
        feedPoolEligible: true
      },
      transport: {
        mode: 'auto'
      },
      preview: {
        mode: 'always',
        autoThumbnail: true,
        maxWidth: 512,
        maxHeight: 512,
        quality: 76
      }
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: {
        Authorization: 'Bearer token',
        'X-Feed': 'home'
      },
      metadata: {
        title: 'Home Stream',
        subtitle: 'feed row',
        description: 'consumer feed playback',
        artist: 'creator',
        imageUri: 'https://cdn.example.com/poster.jpg'
      },
      startup: 'lazy',
      buffer: {
        minBufferMs: 2500,
        maxBufferMs: 30000,
        bufferForPlaybackMs: 800,
        bufferForPlaybackAfterRebufferMs: 1500
      },
      retention: {
        preload: 'metadata',
        offscreen: 'metadata',
        trimDelayMs: 6000,
        feedPoolEligible: true
      },
      transport: {
        mode: 'auto'
      },
      preview: {
        mode: 'always',
        autoThumbnail: true,
        maxWidth: 512,
        maxHeight: 512,
        quality: 76
      }
    });
  });

  it('supports React Native asset sources inside NitroSourceConfig', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    createNativeNitroSource({
      uri: 42
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'asset://42'
      })
    );
  });

  it('rejects an unknown startup value before reaching the native factory', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', startup: 'turbo' as never })).toThrow(/Invalid startup/);
    expect(fromNitroPlayerConfig).not.toHaveBeenCalled();
  });

  it('rejects an unknown transport mode', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', transport: { mode: 'tunnel' as never } })).toThrow(/Invalid transport\.mode/);
    expect(fromNitroPlayerConfig).not.toHaveBeenCalled();
  });

  it('rejects an unknown preview mode and retention preload level', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', preview: { mode: 'eager' as never } })).toThrow(/Invalid preview\.mode/);
    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', retention: { preload: 'all' as never } })).toThrow(/Invalid retention\.preload/);
  });

  it('rejects malformed nested source config before native factory ownership', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', metadata: 'title' as never })).toThrow(/Invalid metadata/);
    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', buffer: ['fast'] as never })).toThrow(/Invalid buffer/);
    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', retention: true as never })).toThrow(/Invalid retention/);
    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', retention: { offscreen: 'warm' as never } })).toThrow(/Invalid retention\.offscreen/);
    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', transport: 'proxy' as never })).toThrow(/Invalid transport/);
    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', preview: 1 as never })).toThrow(/Invalid preview/);
    expect(fromNitroPlayerConfig).not.toHaveBeenCalled();
  });

  it('rejects a malformed headers shape', () => {
    const { createNativeNitroSource } = require('../../../source/sourceFactory');

    expect(() => createNativeNitroSource({ uri: 'https://cdn.example.com/v.mp4', headers: ['x'] as never })).toThrow(/Invalid headers/);
  });
});
