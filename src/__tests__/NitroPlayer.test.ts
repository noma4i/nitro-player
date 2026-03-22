const release = jest.fn();
const nativePlay = jest.fn();
const nativePause = jest.fn();
const nativeSeekTo = jest.fn();
let nativeVolume = 0.5;
let nativeMuted = false;

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios'
  }
}));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    updateMemorySize: jest.fn()
  }
}));

jest.mock('../core/utils/sourceFactory', () => ({
  createSource: jest.fn(() => ({ id: 'source' }))
}));

jest.mock('../core/utils/playerFactory', () => ({
  createPlayer: jest.fn(() => ({
    eventEmitter: {
      clearAllListeners: jest.fn()
    },
    source: { id: 'source' },
    memorySnapshot: {
      playerBytes: 0,
      sourceBytes: 0,
      totalBytes: 0,
      preloadLevel: 'buffered',
      retentionState: 'hot',
      isAttachedToView: false,
      isPlaying: false
    },
    release,
    play: nativePlay,
    pause: nativePause,
    seekTo: nativeSeekTo,
    get volume() {
      return nativeVolume;
    },
    set volume(v: number) {
      nativeVolume = v;
    },
    get muted() {
      return nativeMuted;
    },
    set muted(v: boolean) {
      nativeMuted = v;
    }
  }))
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
        playerBytes: 0,
        sourceBytes: 0,
        totalBytes: 0,
        preloadLevel: 'buffered',
        retentionState: 'hot',
        isAttachedToView: false,
        isPlaying: false
      },
      release: release,
      play: nativePlay,
      pause: nativePause,
      seekTo: nativeSeekTo,
      get volume() {
        return nativeVolume;
      },
      set volume(v: number) {
        nativeVolume = v;
      },
      get muted() {
        return nativeMuted;
      },
      set muted(v: boolean) {
        nativeMuted = v;
      }
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

describe('NitroPlayer async methods', () => {
  const nativeInitialize = jest.fn();
  const nativePreload = jest.fn();
  const nativeReplaceSourceAsync = jest.fn();
  const nativeSeekBy = jest.fn();
  let nativeLoop = false;
  let nativeRate = 1;
  let nativeMixAudioMode = 'mixWithOthers';
  let nativePlayInBackground = false;
  let nativePlayWhenInactive = false;
  let nativeCurrentTime = 0;
  let nativeIgnoreSilentSwitchMode = 'auto';

  const mockPlaybackState = {
    status: 'idle',
    currentTime: 5,
    duration: 100,
    bufferDuration: 10,
    bufferedPosition: 10,
    rate: 1,
    isPlaying: false,
    isBuffering: false,
    isReadyToDisplay: false,
    nativeTimestampMs: 0
  };

  beforeEach(() => {
    nativeInitialize.mockImplementation(() => Promise.resolve());
    nativePreload.mockImplementation(() => Promise.resolve());
    nativeReplaceSourceAsync.mockImplementation(() => Promise.resolve());
    nativeLoop = false;
    nativeRate = 1;
    nativeMixAudioMode = 'mixWithOthers';
    nativePlayInBackground = false;
    nativePlayWhenInactive = false;
    nativeCurrentTime = 0;
    nativeIgnoreSilentSwitchMode = 'auto';
    release.mockClear();

    const { createPlayer } = require('../core/utils/playerFactory') as {
      createPlayer: jest.Mock;
    };
    createPlayer.mockReturnValue({
      eventEmitter: { clearAllListeners: jest.fn() },
      source: { id: 'source' },
      memorySnapshot: {
        playerBytes: 0,
        sourceBytes: 0,
        totalBytes: 0,
        preloadLevel: 'buffered',
        retentionState: 'hot',
        isAttachedToView: false,
        isPlaying: false
      },
      release,
      play: nativePlay,
      pause: nativePause,
      seekTo: nativeSeekTo,
      seekBy: nativeSeekBy,
      initialize: nativeInitialize,
      preload: nativePreload,
      replaceSourceAsync: nativeReplaceSourceAsync,
      get playbackState() {
        return mockPlaybackState;
      },
      get volume() {
        return nativeVolume;
      },
      set volume(v: number) {
        nativeVolume = v;
      },
      get muted() {
        return nativeMuted;
      },
      set muted(v: boolean) {
        nativeMuted = v;
      },
      get loop() {
        return nativeLoop;
      },
      set loop(v: boolean) {
        nativeLoop = v;
      },
      get rate() {
        return nativeRate;
      },
      set rate(v: number) {
        nativeRate = v;
      },
      get mixAudioMode() {
        return nativeMixAudioMode;
      },
      set mixAudioMode(v: string) {
        nativeMixAudioMode = v;
      },
      get playInBackground() {
        return nativePlayInBackground;
      },
      set playInBackground(v: boolean) {
        nativePlayInBackground = v;
      },
      get playWhenInactive() {
        return nativePlayWhenInactive;
      },
      set playWhenInactive(v: boolean) {
        nativePlayWhenInactive = v;
      },
      get currentTime() {
        return nativeCurrentTime;
      },
      set currentTime(v: number) {
        nativeCurrentTime = v;
      },
      get ignoreSilentSwitchMode() {
        return nativeIgnoreSilentSwitchMode;
      },
      set ignoreSilentSwitchMode(v: string) {
        nativeIgnoreSilentSwitchMode = v;
      }
    });
  });

  it('initialize() calls native initialize', async () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    await player.initialize();

    expect(nativeInitialize).toHaveBeenCalledTimes(1);
  });

  it('initialize() calls updateMemorySize after success', async () => {
    const { NitroModules } = require('react-native-nitro-modules');
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    await player.initialize();

    expect(NitroModules.updateMemorySize).toHaveBeenCalled();
  });

  it('preload() calls native preload', async () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    await player.preload();

    expect(nativePreload).toHaveBeenCalledTimes(1);
  });

  it('preload() calls updateMemorySize after success', async () => {
    const { NitroModules } = require('react-native-nitro-modules');
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    await player.preload();

    expect(NitroModules.updateMemorySize).toHaveBeenCalled();
  });

  it('seekBy(time) delegates to native seekBy', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    player.seekBy(15);

    expect(nativeSeekBy).toHaveBeenCalledTimes(1);
    expect(nativeSeekBy).toHaveBeenCalledWith(15);
  });

  it('replaceSourceAsync(source) creates source and calls native', async () => {
    const { createSource } = require('../core/utils/sourceFactory');
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    await player.replaceSourceAsync({ uri: 'https://cdn.example.com/video2.mp4' });

    expect(createSource).toHaveBeenCalled();
    expect(nativeReplaceSourceAsync).toHaveBeenCalledTimes(1);
  });

  it('replaceSourceAsync(null) passes null to native', async () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    await player.replaceSourceAsync(null);

    expect(nativeReplaceSourceAsync).toHaveBeenCalledWith(null);
  });

  it('__destroy is idempotent - second call is no-op', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    player.__destroy();
    player.__destroy();

    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe('NitroPlayer getters', () => {
  const mockPlaybackState = {
    status: 'playing',
    currentTime: 42,
    duration: 200,
    bufferDuration: 10,
    bufferedPosition: 50,
    rate: 1.5,
    isPlaying: true,
    isBuffering: false,
    isReadyToDisplay: true,
    nativeTimestampMs: 0
  };

  let nativeLoop = false;
  let nativeRate = 1;
  let nativePlayInBackground = false;
  let nativeCurrentTime = 0;

  beforeEach(() => {
    nativeLoop = false;
    nativeRate = 1;
    nativePlayInBackground = false;
    nativeCurrentTime = 0;
    release.mockClear();

    const { createPlayer } = require('../core/utils/playerFactory') as {
      createPlayer: jest.Mock;
    };
    createPlayer.mockReturnValue({
      eventEmitter: { clearAllListeners: jest.fn() },
      source: { id: 'source' },
      memorySnapshot: {
        playerBytes: 0,
        sourceBytes: 0,
        totalBytes: 0,
        preloadLevel: 'buffered',
        retentionState: 'hot',
        isAttachedToView: false,
        isPlaying: false
      },
      release,
      play: nativePlay,
      pause: nativePause,
      seekTo: nativeSeekTo,
      get playbackState() {
        return mockPlaybackState;
      },
      get volume() {
        return nativeVolume;
      },
      set volume(v: number) {
        nativeVolume = v;
      },
      get muted() {
        return nativeMuted;
      },
      set muted(v: boolean) {
        nativeMuted = v;
      },
      get loop() {
        return nativeLoop;
      },
      set loop(v: boolean) {
        nativeLoop = v;
      },
      get rate() {
        return nativeRate;
      },
      set rate(v: number) {
        nativeRate = v;
      },
      get mixAudioMode() {
        return 'mixWithOthers';
      },
      set mixAudioMode(_v: string) {},
      get playInBackground() {
        return nativePlayInBackground;
      },
      set playInBackground(v: boolean) {
        nativePlayInBackground = v;
      },
      get playWhenInactive() {
        return false;
      },
      set playWhenInactive(_v: boolean) {},
      get currentTime() {
        return nativeCurrentTime;
      },
      set currentTime(v: number) {
        nativeCurrentTime = v;
      },
      get ignoreSilentSwitchMode() {
        return 'auto';
      },
      set ignoreSilentSwitchMode(_v: string) {}
    });
  });

  it('duration reads from playbackState.duration', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    expect(player.duration).toBe(200);
  });

  it('currentTime reads from playbackState.currentTime', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    expect(player.currentTime).toBe(42);
  });

  it('setter currentTime sets on native player', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    player.currentTime = 99;

    expect(nativeCurrentTime).toBe(99);
  });

  it('getter/setter loop delegates to native', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    expect(player.loop).toBe(false);

    player.loop = true;
    expect(player.loop).toBe(true);
  });

  it('getter rate reads from playbackState.rate', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    expect(player.rate).toBe(1.5);
  });

  it('setter rate sets on native player', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    player.rate = 2;

    expect(nativeRate).toBe(2);
  });

  it('getter/setter playInBackground delegates to native', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    expect(player.playInBackground).toBe(false);

    player.playInBackground = true;
    expect(player.playInBackground).toBe(true);
  });

  it('status reads from playbackState.status', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    expect(player.status).toBe('playing');
  });

  it('isPlaying reads from playbackState.isPlaying', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    expect(player.isPlaying).toBe(true);
  });

  it('isBuffering reads from playbackState.isBuffering', () => {
    const { NitroPlayer } = require('../core/NitroPlayer');
    const player = new NitroPlayer({ uri: 'https://cdn.example.com/video.mp4' });

    expect(player.isBuffering).toBe(false);
  });
});
