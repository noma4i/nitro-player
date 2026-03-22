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
  createSource: jest.fn(() => ({ id: 'source' }))
}));

jest.mock('../core/utils/playerFactory', () => ({
  createPlayer: jest.fn()
}));

function makeMockPlayer() {
  const removeFn = jest.fn();
  const addEventListenerMock = jest.fn(() => ({ remove: removeFn }));
  return {
    addEventListener: addEventListenerMock,
    _removeFn: removeFn
  };
}

describe('useEvent', () => {
  it('calls addEventListener on player', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback = jest.fn();

    renderHook(() => useEvent(player, 'onPlaybackState', callback));

    expect(player.addEventListener).toHaveBeenCalledWith('onPlaybackState', callback);
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

  it('updates subscription when callback changes', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback1 = jest.fn();
    const callback2 = jest.fn();

    const { rerender } = renderHook(({ cb }) => useEvent(player, 'onLoad', cb), { initialProps: { cb: callback1 } });

    expect(player.addEventListener).toHaveBeenCalledWith('onLoad', callback1);
    const firstCallRemove = player._removeFn;

    const secondRemove = jest.fn();
    player.addEventListener.mockReturnValueOnce({ remove: secondRemove });

    rerender({ cb: callback2 });

    expect(firstCallRemove).toHaveBeenCalled();
    expect(player.addEventListener).toHaveBeenCalledWith('onLoad', callback2);
  });

  it('updates subscription when event name changes', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback = jest.fn();

    const { rerender } = renderHook(({ event }) => useEvent(player, event, callback), { initialProps: { event: 'onLoad' } });

    expect(player.addEventListener).toHaveBeenCalledWith('onLoad', callback);

    const secondRemove = jest.fn();
    player.addEventListener.mockReturnValueOnce({ remove: secondRemove });

    rerender({ event: 'onPlaybackState' });

    expect(player._removeFn).toHaveBeenCalled();
    expect(player.addEventListener).toHaveBeenCalledWith('onPlaybackState', callback);
  });
});
