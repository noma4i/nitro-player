import * as React from 'react';
import * as TestRenderer from 'react-test-renderer';

const { act } = TestRenderer;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(),
    updateMemorySize: jest.fn(),
  },
}));

jest.mock('../core/utils/sourceFactory', () => ({
  createSource: jest.fn(() => ({ id: 'source' })),
}));

jest.mock('../core/utils/playerFactory', () => ({
  createPlayer: jest.fn(),
}));

function makeMockPlayer() {
  const removeFn = jest.fn();
  const addEventListenerMock = jest.fn(() => ({ remove: removeFn }));
  return {
    addEventListener: addEventListenerMock,
    _removeFn: removeFn,
  };
}

describe('useEvent', () => {
  it('calls addEventListener on player', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback = jest.fn();

    function TestComponent() {
      useEvent(player, 'onPlaybackState', callback);
      return null;
    }

    act(() => {
      TestRenderer.create(<TestComponent />);
    });

    expect(player.addEventListener).toHaveBeenCalledWith('onPlaybackState', callback);
  });

  it('removes subscription on unmount', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback = jest.fn();

    function TestComponent() {
      useEvent(player, 'onPlaybackState', callback);
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TestComponent />);
    });

    expect(player._removeFn).not.toHaveBeenCalled();

    act(() => {
      renderer!.unmount();
    });

    expect(player._removeFn).toHaveBeenCalledTimes(1);
  });

  it('updates subscription when callback changes', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback1 = jest.fn();
    const callback2 = jest.fn();

    function TestComponent({ cb }: { cb: () => void }) {
      useEvent(player, 'onLoad', cb);
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TestComponent cb={callback1} />);
    });

    expect(player.addEventListener).toHaveBeenCalledWith('onLoad', callback1);
    const firstCallRemove = player._removeFn;

    // Create fresh remove for second subscription
    const secondRemove = jest.fn();
    player.addEventListener.mockReturnValueOnce({ remove: secondRemove });

    act(() => {
      renderer!.update(<TestComponent cb={callback2} />);
    });

    // Old subscription should be removed
    expect(firstCallRemove).toHaveBeenCalled();
    // New subscription should be created
    expect(player.addEventListener).toHaveBeenCalledWith('onLoad', callback2);
  });

  it('updates subscription when event name changes', () => {
    const { useEvent } = require('../core/hooks/useEvent');
    const player = makeMockPlayer();
    const callback = jest.fn();

    function TestComponent({ event }: { event: string }) {
      useEvent(player, event, callback);
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TestComponent event="onLoad" />);
    });

    expect(player.addEventListener).toHaveBeenCalledWith('onLoad', callback);

    const secondRemove = jest.fn();
    player.addEventListener.mockReturnValueOnce({ remove: secondRemove });

    act(() => {
      renderer!.update(<TestComponent event="onPlaybackState" />);
    });

    expect(player._removeFn).toHaveBeenCalled();
    expect(player.addEventListener).toHaveBeenCalledWith('onPlaybackState', callback);
  });
});
