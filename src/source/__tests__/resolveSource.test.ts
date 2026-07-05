import { afterEach, describe, expect, it, jest } from '@jest/globals';

type ResolveSourceModule = typeof import('../resolveSource');

const loadModule = (assetUri = 'asset://video.mp4'): ResolveSourceModule => {
  jest.resetModules();
  jest.doMock('react-native', () => ({
    Image: {
      resolveAssetSource: jest.fn(() => ({ uri: assetUri }))
    }
  }));
  return require('../resolveSource') as ResolveSourceModule;
};

describe('resolveSource', () => {
  afterEach(() => {
    jest.dontMock('react-native');
  });

  it('resolves string sources directly with optional headers', () => {
    const { resolveSource } = loadModule();
    const headers = { Authorization: 'Bearer token' };

    expect(resolveSource('https://cdn.example/video.m3u8', headers)).toEqual({
      uri: 'https://cdn.example/video.m3u8',
      headers
    });
  });

  it('resolves plain uri/header objects without applying policy defaults', () => {
    const { resolveSource } = loadModule();
    const headers = { Authorization: 'Bearer token' };

    expect(resolveSource({ uri: 'https://cdn.example/video.m3u8', headers })).toEqual({
      uri: 'https://cdn.example/video.m3u8',
      headers
    });
  });

  it('resolves numeric asset sources through React Native image metadata', () => {
    const { resolveSource } = loadModule('asset://resolved-video.mp4');

    expect(resolveSource({ uri: 7 })).toEqual({
      uri: 'asset://resolved-video.mp4',
      headers: undefined
    });
  });

  it('keeps prepared source handling for non-plain descriptors', () => {
    const { resolveSource } = loadModule();
    const { prepareSource } = require('../prepareSource') as typeof import('../prepareSource');
    const prepared = prepareSource({
      uri: 'https://cdn.example/video.m3u8',
      policy: 'feed',
      headers: { Authorization: 'Bearer token' }
    });

    expect(resolveSource(prepared)).toEqual({
      uri: prepared.uri,
      headers: prepared.headers
    });
  });
});
