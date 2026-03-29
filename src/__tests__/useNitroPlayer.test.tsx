import { renderHook } from '@testing-library/react';

jest.mock('react-native', () => ({
  Image: {
    resolveAssetSource: jest.fn()
  },
  Platform: {
    select: jest.fn((config: Record<string, string>) => config.ios)
  }
}));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(() => ({
      fromUri: jest.fn(),
      fromNitroPlayerConfig: jest.fn()
    }))
  }
}));

const addEventListener = jest.fn((_event: string, callback: () => void) => ({
  remove: jest.fn(() => callback)
}));

const destroy = jest.fn();

const playerInstance = {
  playbackState: {
    status: 'idle'
  },
  addEventListener,
  __destroy: destroy,
  loop: false,
  muted: false,
  volume: 1,
  rate: 1,
  mixAudioMode: 'mixWithOthers',
  ignoreSilentSwitchMode: 'auto',
  playInBackground: false,
  playWhenInactive: false
};

jest.mock('../core/hooks/useManagedInstance', () => ({
  useManagedInstance: jest.fn(() => playerInstance)
}));

describe('useNitroPlayer', () => {
  beforeEach(() => {
    addEventListener.mockClear();
    destroy.mockClear();
  });

  it('re-applies playerDefaults when object changes without recreating player', () => {
    const { useNitroPlayer } = require('../core/hooks/useNitroPlayer');

    const { rerender } = renderHook(
      ({ defaults }: { defaults: any }) => useNitroPlayer({ uri: 'https://cdn.example.com/video.mp4' }, defaults),
      {
        initialProps: {
          defaults: {
            loop: true,
            volume: 0.5
          }
        }
      }
    );

    expect(playerInstance.loop).toBe(true);
    expect(playerInstance.volume).toBe(0.5);

    rerender({
      defaults: {
        loop: false,
        muted: true
      }
    } as any);

    expect(playerInstance.loop).toBe(false);
    expect(playerInstance.muted).toBe(true);
  });
});
