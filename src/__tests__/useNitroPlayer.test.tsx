import { renderHook } from '@testing-library/react';
import { act } from 'react';

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

const destroy = jest.fn();

const playerInstance = {
  playbackState: {
    status: 'idle'
  },
  replaceSourceAsync: jest.fn(() => Promise.resolve()),
  __destroy: destroy,
};

jest.mock('../core/hooks/useManagedInstance', () => ({
  useManagedInstance: jest.fn(() => playerInstance)
}));

describe('useNitroPlayer', () => {
  beforeEach(() => {
    destroy.mockClear();
    playerInstance.replaceSourceAsync.mockClear();
  });

  it('creates a managed player once and keeps it stable across source updates', async () => {
    const { useNitroPlayer } = require('../core/hooks/useNitroPlayer');
    const { useManagedInstance } = require('../core/hooks/useManagedInstance');

    const initialSource = { uri: 'https://cdn.example.com/video.mp4' };
    const nextSource = { uri: 'https://cdn.example.com/video-2.mp4' };

    const { result, rerender } = renderHook(
      ({ source }: { source: { uri: string } }) => useNitroPlayer(source),
      {
        initialProps: {
          source: initialSource
        }
      }
    );

    expect(result.current).toBe(playerInstance);
    expect(useManagedInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        factory: expect.any(Function),
        cleanup: expect.any(Function)
      }),
      []
    );

    expect(playerInstance.replaceSourceAsync).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ source: nextSource });
    });

    expect(result.current).toBe(playerInstance);
    expect(playerInstance.replaceSourceAsync).toHaveBeenCalledWith(nextSource);
  });
});
