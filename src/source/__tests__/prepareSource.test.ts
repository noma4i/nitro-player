import { describe, expect, it, jest } from '@jest/globals';

type PrepareSourceModule = typeof import('../prepareSource');
type SourcePolicyModule = typeof import('../sourcePolicy');

const loadModules = (): PrepareSourceModule & SourcePolicyModule => {
  jest.resetModules();
  return {
    ...(require('../prepareSource') as PrepareSourceModule),
    ...(require('../sourcePolicy') as SourcePolicyModule)
  };
};

describe('prepareSource policy defaults', () => {
  it('uses built-in feed buffer defaults when no override is configured', () => {
    const { prepareSource } = loadModules();

    const source = prepareSource({ uri: 'https://cdn.example/video.m3u8', policy: 'feed' });

    expect(source.buffer).toEqual({
      preferredPeakBitRate: 6_000_000,
      preferredForwardBufferDurationMs: 12_000
    });
  });

  it('applies configured policy buffer overrides to subsequent preparations', () => {
    const { configureSourcePolicy, prepareSource } = loadModules();

    configureSourcePolicy('feed', {
      buffer: {
        preferredPeakBitRate: 10_000_000
      }
    });

    const source = prepareSource({ uri: 'https://cdn.example/video.m3u8', policy: 'feed' });

    expect(source.buffer).toEqual({
      preferredPeakBitRate: 10_000_000,
      preferredForwardBufferDurationMs: 12_000
    });
  });

  it('keeps explicit per-source buffer ahead of configured policy overrides', () => {
    const { configureSourcePolicy, prepareSource } = loadModules();

    configureSourcePolicy('feed', {
      buffer: {
        preferredPeakBitRate: 10_000_000,
        preferredForwardBufferDurationMs: 18_000
      }
    });

    const source = prepareSource({
      uri: 'https://cdn.example/video.m3u8',
      policy: 'feed',
      buffer: {
        preferredPeakBitRate: 3_000_000
      }
    });

    expect(source.buffer).toEqual({
      preferredPeakBitRate: 3_000_000
    });
  });
});
