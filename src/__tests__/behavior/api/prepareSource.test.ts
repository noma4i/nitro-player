jest.mock('react-native', () => ({
  Image: {
    resolveAssetSource: jest.fn((asset: number) => ({ uri: `asset://${asset}` }))
  }
}));

describe('prepareSource', () => {
  it('accepts a string source and expands auto policy defaults', () => {
    const { prepareSource } = require('../../../source/prepareSource');

    const source = prepareSource('https://cdn.example.com/video.mp4');

    expect(source).toEqual(
      expect.objectContaining({
        uri: 'https://cdn.example.com/video.mp4',
        policy: 'auto',
        startup: 'eager',
        retention: expect.objectContaining({ preload: 'buffered', offscreen: 'metadata' }),
        transport: { mode: 'auto' },
        preview: expect.objectContaining({ mode: 'listener', autoThumbnail: true }),
        identity: expect.objectContaining({
          playbackKey: expect.any(String),
          requestKey: expect.any(String),
          previewKey: expect.any(String)
        })
      })
    );
  });

  it('accepts an RN asset source', () => {
    const { prepareSource } = require('../../../source/prepareSource');

    expect(prepareSource(7)).toEqual(expect.objectContaining({ uri: 'asset://7' }));
  });

  it('keeps semantic identity stable for sorted headers', () => {
    const { prepareSource } = require('../../../source/prepareSource');

    const first = prepareSource({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { B: '2', A: '1' }
    });
    const second = prepareSource({
      uri: 'https://cdn.example.com/live.m3u8',
      headers: { A: '1', B: '2' }
    });

    expect(first.identity).toEqual(second.identity);
  });

  it('lets explicit fields override consumer policy defaults', () => {
    const { prepareSource } = require('../../../source/prepareSource');

    const source = prepareSource({
      uri: 'https://cdn.example.com/live.m3u8',
      policy: 'feed',
      retention: { trimDelayMs: 9000 },
      preview: { mode: 'always' }
    });

    expect(source).toEqual(
      expect.objectContaining({
        policy: 'feed',
        startup: 'lazy',
        retention: expect.objectContaining({
          preload: 'metadata',
          offscreen: 'metadata',
          trimDelayMs: 9000,
          feedPoolEligible: true
        }),
        preview: expect.objectContaining({
          mode: 'always',
          autoThumbnail: true
        })
      })
    );
  });
});
