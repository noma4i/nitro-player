import { renderHook } from '@testing-library/react';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' }
}));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(),
    updateMemorySize: jest.fn()
  }
}));

jest.mock('../core/utils/sourceFactory', () => ({
  createNitroSource: jest.fn(() => ({ id: 'source' }))
}));

jest.mock('../core/utils/playerFactory', () => ({
  createPlayer: jest.fn()
}));

function makeMockPlayer() {
  const removeFn = jest.fn();
  let capturedCallback: ((...args: unknown[]) => void) | null = null;
  const addEventListenerMock = jest.fn((_event: string, cb: (...args: unknown[]) => void) => {
    capturedCallback = cb;
    return { remove: removeFn };
  });
  return {
    addEventListener: addEventListenerMock,
    _removeFn: removeFn,
    _trigger: (...args: unknown[]) => capturedCallback?.(...args)
  };
}

describe('useEvent', () => {
  it('calls addEventListener on player', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback = jest.fn();

    renderHook(() => useEvent(player, 'onPlaybackState', callback));

    expect(player.addEventListener).toHaveBeenCalledWith('onPlaybackState', expect.any(Function));
  });

  it('removes subscription on unmount', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback = jest.fn();

    const { unmount } = renderHook(() => useEvent(player, 'onPlaybackState', callback));

    expect(player._removeFn).not.toHaveBeenCalled();

    unmount();

    expect(player._removeFn).toHaveBeenCalledTimes(1);
  });

  it('callback change does not resubscribe (uses ref)', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback1 = jest.fn();
    const callback2 = jest.fn();

    const { rerender } = renderHook(({ cb }) => useEvent(player, 'onLoad', cb), { initialProps: { cb: callback1 } });

    expect(player.addEventListener).toHaveBeenCalledTimes(1);

    rerender({ cb: callback2 });

    // Should NOT resubscribe - callback is in ref
    expect(player.addEventListener).toHaveBeenCalledTimes(1);
    expect(player._removeFn).not.toHaveBeenCalled();

    // But triggering should call the new callback
    player._trigger('data');
    expect(callback2).toHaveBeenCalledWith('data');
    expect(callback1).not.toHaveBeenCalled();
  });

  it('updates subscription when event name changes', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback = jest.fn();

    const { rerender } = renderHook(({ event }) => useEvent(player, event, callback), { initialProps: { event: 'onLoad' } });

    expect(player.addEventListener).toHaveBeenCalledWith('onLoad', expect.any(Function));

    const secondRemove = jest.fn();
    player.addEventListener.mockReturnValueOnce({ remove: secondRemove });

    rerender({ event: 'onPlaybackState' });

    expect(player._removeFn).toHaveBeenCalled();
    expect(player.addEventListener).toHaveBeenCalledWith('onPlaybackState', expect.any(Function));
  });

  it('does nothing when player is null', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const callback = jest.fn();

    const { result } = renderHook(() => useEvent(null, 'onPlaybackState', callback));

    expect(result.current).toBeUndefined();
  });

  it('does nothing when player is undefined', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const callback = jest.fn();

    const { result } = renderHook(() => useEvent(undefined, 'onLoad', callback));

    expect(result.current).toBeUndefined();
  });
});
