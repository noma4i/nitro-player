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
    const { createNitroSource } = require('../../../source/sourceFactory');

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
    const { createNitroSource } = require('../../../source/sourceFactory');

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
    const { createNitroSource } = require('../../../source/sourceFactory');

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

  it('preserves the complete v2 source DSL for native source ownership', () => {
    const { createNitroSource } = require('../../../source/sourceFactory');

    createNitroSource({
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
    const { createNitroSource } = require('../../../source/sourceFactory');

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
    const { createNitroSource } = require('../../../source/sourceFactory');

    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', startup: 'turbo' as never })).toThrow(/Invalid startup/);
    expect(fromNitroPlayerConfig).not.toHaveBeenCalled();
  });

  it('rejects an unknown transport mode', () => {
    const { createNitroSource } = require('../../../source/sourceFactory');

    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', transport: { mode: 'tunnel' as never } })).toThrow(/Invalid transport\.mode/);
    expect(fromNitroPlayerConfig).not.toHaveBeenCalled();
  });

  it('rejects an unknown preview mode and retention preload level', () => {
    const { createNitroSource } = require('../../../source/sourceFactory');

    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', preview: { mode: 'eager' as never } })).toThrow(/Invalid preview\.mode/);
    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', retention: { preload: 'all' as never } })).toThrow(/Invalid retention\.preload/);
  });

  it('rejects malformed nested source config before native factory ownership', () => {
    const { createNitroSource } = require('../../../source/sourceFactory');

    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', metadata: 'title' as never })).toThrow(/Invalid metadata/);
    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', buffer: ['fast'] as never })).toThrow(/Invalid buffer/);
    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', retention: true as never })).toThrow(/Invalid retention/);
    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', retention: { offscreen: 'warm' as never } })).toThrow(/Invalid retention\.offscreen/);
    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', transport: 'proxy' as never })).toThrow(/Invalid transport/);
    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', preview: 1 as never })).toThrow(/Invalid preview/);
    expect(fromNitroPlayerConfig).not.toHaveBeenCalled();
  });

  it('rejects a malformed headers shape', () => {
    const { createNitroSource } = require('../../../source/sourceFactory');

    expect(() => createNitroSource({ uri: 'https://cdn.example.com/v.mp4', headers: ['x'] as never })).toThrow(/Invalid headers/);
  });
});
