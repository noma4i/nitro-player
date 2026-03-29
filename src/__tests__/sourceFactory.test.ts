jest.mock('react-native', () => ({
  Image: {
    resolveAssetSource: jest.fn()
  },
  Platform: {
    select: jest.fn((config: Record<string, string>) => config.ios)
  }
}));

const fromUri = jest.fn((uri: string) => ({ uri }));
const fromNitroPlayerConfig = jest.fn((config: unknown) => ({ config }));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(() => ({
      fromUri,
      fromNitroPlayerConfig
    }))
  }
}));

const getProxiedUrl = jest.fn((uri: string) => `proxied:${uri}`);

jest.mock('../hls/hlsCacheProxy', () => ({
  hlsCacheProxy: {
    getProxiedUrl
  }
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

    expect(getProxiedUrl).toHaveBeenCalledWith('https://cdn.example.com/live.M3U8?token=abc#main', undefined);
    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      uri: 'proxied:https://cdn.example.com/live.M3U8?token=abc#main',
      initializeOnCreation: true,
      memoryConfig: {
        profile: 'balanced',
        preloadLevel: 'buffered',
        offscreenRetention: 'hot',
        pauseTrimDelayMs: 10000
      }
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
        pauseTrimDelayMs: 10000
      }
    });
  });

  it('uses metadata retention defaults for feed profile sources', () => {
    const { createSourceFromNitroPlayerConfig } = require('../core/utils/sourceFactory');

    createSourceFromNitroPlayerConfig(
      {
        uri: 'https://cdn.example.com/feed-item.mp4',
        memoryConfig: {
          profile: 'feed'
        }
      },
      'feed'
    );

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith({
      uri: 'https://cdn.example.com/feed-item.mp4',
      initializeOnCreation: true,
      memoryConfig: {
        profile: 'feed',
        preloadLevel: 'metadata',
        offscreenRetention: 'metadata',
        pauseTrimDelayMs: 3000
      }
    });
  });

  it('does not mutate the caller provided config object', () => {
    const { createSourceFromNitroPlayerConfig } = require('../core/utils/sourceFactory');

    const source = {
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { Authorization: 'Bearer token' }
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
        pauseTrimDelayMs: 10000
      },
      initializeOnCreation: true
    });
  });

  it('getSourceIdentityKey returns the string itself for a string URI', () => {
    const { getSourceIdentityKey } = require('../core/utils/sourceFactory');

    expect(getSourceIdentityKey('https://cdn.example.com/video.mp4')).toBe('https://cdn.example.com/video.mp4');
  });

  it('getSourceIdentityKey returns String(number) for a number source', () => {
    const { getSourceIdentityKey } = require('../core/utils/sourceFactory');

    expect(getSourceIdentityKey(42)).toBe('42');
  });

  it('getSourceIdentityKey changes when material source config changes', () => {
    const { getSourceIdentityKey } = require('../core/utils/sourceFactory');

    const baseSource = {
      uri: 'https://cdn.example.com/live.m3u8',
      useHlsProxy: true,
      headers: {
        Authorization: 'Bearer one'
      },
      memoryConfig: {
        profile: 'feed',
        preloadLevel: 'metadata',
        offscreenRetention: 'metadata'
      }
    };
    const key = getSourceIdentityKey(baseSource);
    const nextKey = getSourceIdentityKey({
      ...baseSource,
      headers: {
        Authorization: 'Bearer two'
      }
    });

    expect(key).not.toBe(nextKey);
    expect(key).toContain('https://cdn.example.com/live.m3u8');
  });

  it('getSourceIdentityKey uses object identity for NitroPlayerSource instances', () => {
    const { getSourceIdentityKey } = require('../core/utils/sourceFactory');

    const firstSource = { name: 'NitroPlayerSource', uri: 'https://cdn.example.com/video.mp4' };
    const secondSource = { name: 'NitroPlayerSource', uri: 'https://cdn.example.com/video.mp4' };

    expect(getSourceIdentityKey(firstSource)).not.toBe(getSourceIdentityKey(secondSource));
    expect(getSourceIdentityKey(firstSource)).toBe(getSourceIdentityKey(firstSource));
  });

  it('createSource returns source directly if isNitroPlayerSource returns true', () => {
    const { createSource } = require('../core/utils/sourceFactory');

    const nitroSource = { name: 'NitroPlayerSource', uri: 'https://cdn.example.com/video.mp4' };
    const result = createSource(nitroSource);

    expect(result).toBe(nitroSource);
    expect(fromNitroPlayerConfig).not.toHaveBeenCalled();
  });

  it('createSource dispatches string to createSourceFromUri', () => {
    const { createSource } = require('../core/utils/sourceFactory');

    createSource('https://cdn.example.com/video.mp4');

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'https://cdn.example.com/video.mp4',
        initializeOnCreation: true
      })
    );
  });

  it('createSource throws for null source', () => {
    const { createSource } = require('../core/utils/sourceFactory');

    expect(() => createSource(null)).toThrow();
  });

  it('createSource throws for undefined source', () => {
    const { createSource } = require('../core/utils/sourceFactory');

    expect(() => createSource(undefined)).toThrow();
  });

  it('createSourceFromNitroPlayerConfig with useHlsProxy:false skips proxy for m3u8', () => {
    const { createSourceFromNitroPlayerConfig } = require('../core/utils/sourceFactory');

    createSourceFromNitroPlayerConfig({
      uri: 'https://cdn.example.com/live.m3u8',
      useHlsProxy: false
    });

    expect(getProxiedUrl).not.toHaveBeenCalled();
    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'https://cdn.example.com/live.m3u8'
      })
    );
  });

  it('createSourceFromNitroPlayerConfig sets initializeOnCreation:true by default', () => {
    const { createSourceFromNitroPlayerConfig } = require('../core/utils/sourceFactory');

    createSourceFromNitroPlayerConfig({
      uri: 'https://cdn.example.com/video.mp4'
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        initializeOnCreation: true
      })
    );
  });

  it('immersive profile has Infinity pauseTrimDelayMs', () => {
    const { createSourceFromNitroPlayerConfig } = require('../core/utils/sourceFactory');

    createSourceFromNitroPlayerConfig({
      uri: 'https://cdn.example.com/video.mp4',
      memoryConfig: { profile: 'immersive' }
    });

    expect(fromNitroPlayerConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryConfig: expect.objectContaining({
          profile: 'immersive',
          pauseTrimDelayMs: Infinity
        })
      })
    );
  });

  it('getSourceIdentityKey returns empty string for null', () => {
    const { getSourceIdentityKey } = require('../core/utils/sourceFactory');

    expect(getSourceIdentityKey(null)).toBe('');
  });
});
