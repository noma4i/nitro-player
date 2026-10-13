import { describe, expect, it, jest } from '@jest/globals';

type PrepareSourceModule = typeof import('../prepareSource');

const loadModules = (): PrepareSourceModule => {
  jest.resetModules();
  return require('../prepareSource') as PrepareSourceModule;
};

describe('prepareSource policy defaults', () => {
  it('uses built-in feed buffer defaults when no override is configured', () => {
    const { prepareSource } = loadModules();

    const source = prepareSource({ uri: 'https://cdn.example/video.m3u8', policy: 'feed' });

    expect(source.buffer).toEqual({ preferredPeakBitRate: 6_000_000 });
  });

  it('merges explicit per-source buffer fields over policy defaults', () => {
    const { prepareSource } = loadModules();
    const source = prepareSource({
      uri: 'https://cdn.example/video.m3u8',
      policy: 'feed',
      buffer: {
        preferredPeakBitRate: 3_000_000
      }
    });

    expect(source.buffer).toEqual({ preferredPeakBitRate: 3_000_000 });
  });

  it('clears policy buffer defaults when explicit buffer is empty', () => {
    const { prepareSource } = loadModules();

    const source = prepareSource({
      uri: 'https://cdn.example/video.m3u8',
      policy: 'feed',
      buffer: {}
    });

    expect(source.buffer).toEqual({});
  });

  it('merges explicit retention fields over policy defaults', () => {
    const { prepareSource } = loadModules();

    const source = prepareSource({
      uri: 'https://cdn.example/video.m3u8',
      policy: 'feed',
      retention: {
        preload: 'none'
      }
    });

    expect(source.retention).toEqual({
      preload: 'none',
      offscreen: 'metadata',
      trimDelayMs: 4000
    });
  });

  it('uses explicit scalar startup over the policy default', () => {
    const { prepareSource } = loadModules();

    const source = prepareSource({
      uri: 'https://cdn.example/video.m3u8',
      policy: 'feed',
      startup: 'eager'
    });

    expect(source.startup).toBe('eager');
  });

  it('leaves sections undefined for the manual policy unless explicit fields are provided', () => {
    const { prepareSource } = loadModules();

    const source = prepareSource({
      uri: 'https://cdn.example/video.mp4',
      policy: 'manual'
    });

    expect(source.startup).toBeUndefined();
    expect(source.buffer).toBeUndefined();
    expect(source.retention).toBeUndefined();
    expect(source.transport).toBeUndefined();
  });

  it('changes playback key when policy changes the resolved config', () => {
    const { prepareSource } = loadModules();

    const feed = prepareSource({ uri: 'https://cdn.example/video.m3u8', policy: 'feed' });
    const hero = prepareSource({ uri: 'https://cdn.example/video.m3u8', policy: 'hero' });

    expect(hero.identity.playbackKey).not.toBe(feed.identity.playbackKey);
  });

  it('returns branded prepared sources unchanged', () => {
    const { prepareSource } = loadModules();
    const prepared = prepareSource({ uri: 'https://cdn.example/video.m3u8' });

    expect(prepareSource(prepared)).toBe(prepared);
  });

  it('builds JS identity from playback key and request key', () => {
    const { prepareSource } = loadModules();

    const source = prepareSource({ uri: 'https://cdn.example/video.m3u8', headers: { Authorization: 'Bearer token' } });

    expect(source.identity).toEqual({ playbackKey: expect.any(String), requestKey: expect.any(String) });
    expect(source.identity).not.toHaveProperty('previewKey');
  });

  it('keeps raw object validation coverage after merging defaults', () => {
    const { prepareSource } = loadModules();

    expect(() =>
      prepareSource({
        uri: 'https://cdn.example/video.m3u8',
        retention: 'metadata'
      } as never)
    ).toThrow('Invalid retention: expected an object');
  });
});
