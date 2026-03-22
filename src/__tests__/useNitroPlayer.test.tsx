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
  source: {
    config: {
      initializeOnCreation: false
    }
  },
  playbackState: {
    status: 'idle'
  },
  addEventListener,
  __destroy: destroy
};

jest.mock('../core/hooks/useManagedInstance', () => ({
  useManagedInstance: jest.fn(() => playerInstance)
}));

describe('useNitroPlayer', () => {
  beforeEach(() => {
    addEventListener.mockClear();
    destroy.mockClear();
  });

  it('re-applies setup when callback changes without recreating player', () => {
    const firstSetup = jest.fn();
    const secondSetup = jest.fn();
    const { useNitroPlayer } = require('../core/hooks/useNitroPlayer');

    const { rerender } = renderHook(({ setup }) => useNitroPlayer({ uri: 'https://cdn.example.com/video.mp4' }, setup), { initialProps: { setup: firstSetup } });

    expect(firstSetup).toHaveBeenCalledWith(playerInstance);

    rerender({ setup: secondSetup });

    expect(secondSetup).toHaveBeenCalledWith(playerInstance);
    expect(firstSetup).toHaveBeenCalledTimes(1);
  });
});
