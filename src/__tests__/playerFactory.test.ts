const nativeCreatePlayer = jest.fn((source: unknown) => ({ source }));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(() => ({
      createPlayer: nativeCreatePlayer,
    })),
  },
}));

jest.mock('../core/utils/sourceFactory', () => ({
  createSource: jest.fn((s: unknown) => ({ uri: s })),
  isNitroPlayerSource: jest.fn((s: unknown) => s != null && typeof s === 'object' && 'uri' in (s as Record<string, unknown>) && 'name' in (s as Record<string, unknown>) && (s as Record<string, unknown>).name === 'NitroPlayerSource'),
}));

describe('playerFactory', () => {
  beforeEach(() => {
    nativeCreatePlayer.mockImplementation((source: unknown) => ({ source }));

    const { createSource, isNitroPlayerSource } = require('../core/utils/sourceFactory');
    (createSource as jest.Mock).mockImplementation((s: unknown) => ({ uri: s }));
    (isNitroPlayerSource as jest.Mock).mockImplementation(
      (s: unknown) => s != null && typeof s === 'object' && 'uri' in (s as Record<string, unknown>) && 'name' in (s as Record<string, unknown>) && (s as Record<string, unknown>).name === 'NitroPlayerSource'
    );
  });

  it('createPlayer with source object calls NitroPlayerFactory.createPlayer', () => {
    const { createPlayer } = require('../core/utils/playerFactory');

    const result = createPlayer('https://cdn.example.com/video.mp4');

    expect(nativeCreatePlayer).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ source: { uri: 'https://cdn.example.com/video.mp4' } });
  });

  it('createPlayer wraps native errors via tryParseNativeNitroPlayerError', () => {
    const { createPlayer } = require('../core/utils/playerFactory');

    nativeCreatePlayer.mockImplementation(() => {
      throw new Error('{%@source/invalid-uri::Bad URI@%}');
    });

    expect(() => createPlayer('bad')).toThrow();
  });

  it('createPlayer passes NitroPlayerSource directly if isNitroPlayerSource is true', () => {
    const { createPlayer } = require('../core/utils/playerFactory');
    const { createSource } = require('../core/utils/sourceFactory');

    const nitroSource = { name: 'NitroPlayerSource', uri: 'https://cdn.example.com/video.mp4' };
    createPlayer(nitroSource);

    expect(createSource).not.toHaveBeenCalled();
    expect(nativeCreatePlayer).toHaveBeenCalledWith(nitroSource);
  });
});
