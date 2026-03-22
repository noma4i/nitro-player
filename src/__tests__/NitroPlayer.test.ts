const release = jest.fn();
const nativePlay = jest.fn();
const nativePause = jest.fn();
const nativeSeekTo = jest.fn();
let nativeVolume = 0.5;
let nativeMuted = false;

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    updateMemorySize: jest.fn(),
  },
}));

jest.mock('../core/utils/sourceFactory', () => ({
  createSource: jest.fn(() => ({ id: 'source' })),
}));

jest.mock('../core/utils/playerFactory', () => ({
  createPlayer: jest.fn(() => ({
    eventEmitter: {
      clearAllListeners: jest.fn(),
    },
    source: { id: 'source' },
    memorySnapshot: {
      playerBytes: 0,
      sourceBytes: 0,
      totalBytes: 0,
      preloadLevel: 'buffered',
      retentionState: 'hot',
      isAttachedToView: false,
      isPlaying: false,
    },
    release,
    play: nativePlay,
    pause: nativePause,
    seekTo: nativeSeekTo,
    get volume() { return nativeVolume; },
    set volume(v: number) { nativeVolume = v; },
    get muted() { return nativeMuted; },
    set muted(v: boolean) { nativeMuted = v; },
  })),
}));

describe('NitroPlayer release contract', () => {
  beforeEach(() => {
    release.mockClear();
  });

  it('becomes unusable immediately after release', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');

    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });
    player.release();

    expect(release).toHaveBeenCalledTimes(1);
    expect(() => player.play()).toThrow(/released/);
  });
});

describe('NitroPlayer delegation', () => {
  const createMockPlayer = () => {
    const { createPlayer } = require('../core/utils/playerFactory') as {
      createPlayer: jest.Mock;
    };
    createPlayer.mockReturnValue({
      eventEmitter: { clearAllListeners: jest.fn() },
      source: { id: 'source' },
      memorySnapshot: {
        playerBytes: 0, sourceBytes: 0, totalBytes: 0,
        preloadLevel: 'buffered', retentionState: 'hot',
        isAttachedToView: false, isPlaying: false,
      },
      release: release,
      play: nativePlay,
      pause: nativePause,
      seekTo: nativeSeekTo,
      get volume() { return nativeVolume; },
      set volume(v: number) { nativeVolume = v; },
      get muted() { return nativeMuted; },
      set muted(v: boolean) { nativeMuted = v; },
    });
  };

  beforeEach(() => {
    nativePlay.mockClear();
    nativePause.mockClear();
    nativeSeekTo.mockClear();
    release.mockClear();
    nativeVolume = 0.5;
    nativeMuted = false;
    createMockPlayer();
  });

  it('play() delegates to native hybrid play', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    player.play();

    expect(nativePlay).toHaveBeenCalledTimes(1);
  });

  it('pause() delegates to native hybrid pause', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    player.pause();

    expect(nativePause).toHaveBeenCalledTimes(1);
  });

  it('seekTo(time) delegates to native hybrid seekTo', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    player.seekTo(42);

    expect(nativeSeekTo).toHaveBeenCalledTimes(1);
    expect(nativeSeekTo).toHaveBeenCalledWith(42);
  });

  it('volume getter/setter delegates to native', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    expect(player.volume).toBe(0.5);

    player.volume = 0.8;
    expect(player.volume).toBe(0.8);
  });

  it('muted getter/setter delegates to native', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    expect(player.muted).toBe(false);

    player.muted = true;
    expect(player.muted).toBe(true);
  });
});
