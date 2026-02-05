const release = jest.fn();

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
  })),
}));

describe('VideoPlayer release contract', () => {
  beforeEach(() => {
    release.mockClear();
  });

  it('becomes unusable immediately after release', () => {
    const { VideoPlayer } = require('../core/VideoPlayer');

    const player = new VideoPlayer({ uri: 'https://cdn.example.com/video.mp4' });
    player.release();

    expect(release).toHaveBeenCalledTimes(1);
    expect(() => player.play()).toThrow(/released/);
  });
});
