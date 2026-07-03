const createNativePlayer = () => ({
  eventEmitter: {
    clearAllListeners: jest.fn()
  },
  playbackState: {
    status: 'idle',
    currentTime: 0,
    duration: Number.NaN,
    isPlaying: false,
    isBuffering: false,
    isVisualReady: false,
    bufferDuration: 0,
    bufferedPosition: 0,
    rate: 1
  },
  memorySnapshot: {
    isAttachedToView: false,
    retentionState: 'metadata'
  },
  initialize: jest.fn(() => Promise.resolve()),
  preload: jest.fn(() => Promise.resolve()),
  replaceSourceAsync: jest.fn(() => Promise.resolve()),
  clearSourceAsync: jest.fn(() => Promise.resolve()),
  release: jest.fn()
});

type PlayerModule = typeof import('../NitroPlayer');

const loadModule = () => {
  const nativePlayer = createNativePlayer();
  const createdSources = [
    { name: 'NitroPlayerSource', uri: 'https://cdn.example/a.m3u8' },
    { name: 'NitroPlayerSource', uri: 'https://cdn.example/b.m3u8' }
  ];
  const fromNitroPlayerConfig = jest.fn(() => {
    const source = createdSources.shift();
    if (!source) {
      throw new Error('unexpected source creation');
    }
    return source;
  });
  const createPlayer = jest.fn(() => nativePlayer);
  const updateMemorySize = jest.fn();
  const createHybridObject = jest.fn((name: string) => {
    if (name === 'NitroPlayerSourceFactory') {
      return { fromNitroPlayerConfig };
    }
    if (name === 'NitroPlayerFactory') {
      return { createPlayer };
    }
    throw new Error(`unexpected hybrid object: ${name}`);
  });

  Object.defineProperty(nativePlayer, 'source', {
    get() {
      throw new Error('player source getter should not be read');
    }
  });

  jest.resetModules();
  jest.doMock('react-native', () => ({
    Platform: { OS: 'ios' }
  }));
  jest.doMock('react-native-nitro-modules', () => ({
    NitroModules: {
      createHybridObject,
      updateMemorySize
    }
  }));

  const module = require('../NitroPlayer') as PlayerModule;
  return { ...module, nativePlayer, createPlayer, fromNitroPlayerConfig, updateMemorySize };
};

describe('NitroPlayer', () => {
  afterEach(() => {
    jest.dontMock('react-native');
    jest.dontMock('react-native-nitro-modules');
  });

  it('keeps owned native source references without reading player.source', async () => {
    const { NitroPlayer, nativePlayer, createPlayer, fromNitroPlayerConfig, updateMemorySize } = loadModule();

    const player = new NitroPlayer('https://cdn.example/a.m3u8');
    await player.initialize();
    await player.replaceSourceAsync('https://cdn.example/b.m3u8');
    player.release();

    const firstNativeSource = fromNitroPlayerConfig.mock.results[0].value;
    const secondNativeSource = fromNitroPlayerConfig.mock.results[1].value;

    expect(createPlayer).toHaveBeenCalledWith(firstNativeSource);
    expect(nativePlayer.replaceSourceAsync).toHaveBeenCalledWith(secondNativeSource);
    expect(updateMemorySize).toHaveBeenCalledWith(nativePlayer);
    expect(updateMemorySize).toHaveBeenCalledWith(firstNativeSource);
    expect(updateMemorySize).toHaveBeenCalledWith(secondNativeSource);
    expect(nativePlayer.release).toHaveBeenCalledTimes(1);
  });
});

export {};
