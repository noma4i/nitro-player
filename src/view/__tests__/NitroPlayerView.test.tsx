import * as React from 'react';
import { act, render } from '@testing-library/react';
import type { NitroPlayer } from '../../player/NitroPlayer';
import type { NitroPlayerDefaults } from '../../player/types/NitroPlayerDefaults';

type ViewModule = typeof import('../NitroPlayerView');
type ListenerStore = {
  onAttached?: () => void;
  onDetached?: () => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
  willEnterFullscreen?: () => void;
  willExitFullscreen?: () => void;
};
type MockManager = {
  isAttached: boolean;
  addOnAttachedListener: jest.Mock;
  addOnDetachedListener: jest.Mock;
  addOnFullscreenChangeListener: jest.Mock;
  addWillEnterFullscreenListener: jest.Mock;
  addWillExitFullscreenListener: jest.Mock;
  setPlayerDefaults: jest.Mock;
  clearPlayerDefaults: jest.Mock;
  clearAllListeners: jest.Mock;
  enterFullscreen: jest.Mock;
  exitFullscreen: jest.Mock;
};
type NativeWrites = {
  surfaceType: jest.Mock;
  controls: jest.Mock;
  resizeMode: jest.Mock;
  keepScreenAwake: jest.Mock;
  player: jest.Mock;
};

const createSubscription = () => ({
  remove: jest.fn()
});

const createMockManager = () => {
  const listeners: ListenerStore = {};
  const writes: NativeWrites = {
    surfaceType: jest.fn(),
    controls: jest.fn(),
    resizeMode: jest.fn(),
    keepScreenAwake: jest.fn(),
    player: jest.fn()
  };
  const manager: MockManager = {
    isAttached: false,
    addOnAttachedListener: jest.fn(listener => {
      listeners.onAttached = listener;
      return createSubscription();
    }),
    addOnDetachedListener: jest.fn(listener => {
      listeners.onDetached = listener;
      return createSubscription();
    }),
    addOnFullscreenChangeListener: jest.fn(listener => {
      listeners.onFullscreenChange = listener;
      return createSubscription();
    }),
    addWillEnterFullscreenListener: jest.fn(listener => {
      listeners.willEnterFullscreen = listener;
      return createSubscription();
    }),
    addWillExitFullscreenListener: jest.fn(listener => {
      listeners.willExitFullscreen = listener;
      return createSubscription();
    }),
    setPlayerDefaults: jest.fn(),
    clearPlayerDefaults: jest.fn(),
    clearAllListeners: jest.fn(),
    enterFullscreen: jest.fn(),
    exitFullscreen: jest.fn()
  };

  Object.defineProperty(manager, 'surfaceType', { set: writes.surfaceType });
  Object.defineProperty(manager, 'controls', { set: writes.controls });
  Object.defineProperty(manager, 'resizeMode', { set: writes.resizeMode });
  Object.defineProperty(manager, 'keepScreenAwake', { set: writes.keepScreenAwake });
  Object.defineProperty(manager, 'player', { set: writes.player });

  return { listeners, manager, writes };
};

const createPlayer = (nativePlayer: object): NitroPlayer =>
  ({
    __getNativePlayer: jest.fn(() => nativePlayer)
  }) as unknown as NitroPlayer;

const loadModule = () => {
  const viewManager = createMockManager();
  const createViewManager = jest.fn(() => viewManager.manager);

  jest.resetModules();
  jest.doMock('react', () => React);
  jest.doMock('react-native-nitro-modules', () => ({
    NitroModules: {
      createHybridObject: jest.fn((name: string) => {
        if (name === 'NitroPlayerViewManagerFactory') {
          return { createViewManager };
        }
        throw new Error(`unexpected hybrid object: ${name}`);
      })
    }
  }));
  jest.doMock('../../player/NitroPlayer', () => ({
    NitroPlayer: class NitroPlayer {}
  }));
  jest.doMock('../../player/hooks/useNitroPlayer', () => ({
    useNitroPlayer: jest.fn()
  }));
  jest.doMock('../NativeNitroPlayerView', () => ({
    NativeNitroPlayerView: ({ onNitroIdChange }: { onNitroIdChange: (event: { nativeEvent: { nitroId: number } }) => void }) => {
      React.useEffect(() => {
        onNitroIdChange({ nativeEvent: { nitroId: 101 } });
      }, [onNitroIdChange]);
      return React.createElement('div');
    }
  }));

  const module = require('../NitroPlayerView') as ViewModule;
  return { ...viewManager, NitroPlayerView: module.default, createViewManager };
};

describe('NitroPlayerView', () => {
  afterEach(() => {
    jest.dontMock('react');
    jest.dontMock('react-native-nitro-modules');
    jest.dontMock('../../player/NitroPlayer');
    jest.dontMock('../../player/hooks/useNitroPlayer');
    jest.dontMock('../NativeNitroPlayerView');
  });

  it('keeps native view listener subscriptions stable across inline callback rerenders', async () => {
    const { listeners, manager, NitroPlayerView } = loadModule();
    const player = createPlayer({});
    const firstFullscreen = jest.fn();
    const secondFullscreen = jest.fn();

    const view = render(
      <NitroPlayerView
        player={player}
        onAttached={() => undefined}
        onDetached={() => undefined}
        onFullscreenChange={firstFullscreen}
        willEnterFullscreen={() => undefined}
        willExitFullscreen={() => undefined}
      />
    );
    await act(async () => undefined);

    expect(manager.addOnAttachedListener).toHaveBeenCalledTimes(1);
    expect(manager.addOnDetachedListener).toHaveBeenCalledTimes(1);
    expect(manager.addOnFullscreenChangeListener).toHaveBeenCalledTimes(1);
    expect(manager.addWillEnterFullscreenListener).toHaveBeenCalledTimes(1);
    expect(manager.addWillExitFullscreenListener).toHaveBeenCalledTimes(1);

    view.rerender(
      <NitroPlayerView
        player={player}
        onAttached={() => undefined}
        onDetached={() => undefined}
        onFullscreenChange={secondFullscreen}
        willEnterFullscreen={() => undefined}
        willExitFullscreen={() => undefined}
      />
    );
    await act(async () => undefined);

    expect(manager.addOnAttachedListener).toHaveBeenCalledTimes(1);
    expect(manager.addOnDetachedListener).toHaveBeenCalledTimes(1);
    expect(manager.addOnFullscreenChangeListener).toHaveBeenCalledTimes(1);
    expect(manager.addWillEnterFullscreenListener).toHaveBeenCalledTimes(1);
    expect(manager.addWillExitFullscreenListener).toHaveBeenCalledTimes(1);

    act(() => {
      listeners.onFullscreenChange?.(true);
    });
    expect(firstFullscreen).not.toHaveBeenCalled();
    expect(secondFullscreen).toHaveBeenCalledWith(true);
  });

  it('writes only changed native props after initial manager setup', async () => {
    const { manager, writes, NitroPlayerView } = loadModule();
    const nativePlayerA = {};
    const nativePlayerB = {};
    const playerA = createPlayer(nativePlayerA);
    const playerB = createPlayer(nativePlayerB);
    const defaultsA: NitroPlayerDefaults = { muted: true, volume: 0.5 };
    const defaultsEquivalent: NitroPlayerDefaults = { muted: true, volume: 0.5 };
    const defaultsChanged: NitroPlayerDefaults = { muted: false, volume: 0.5 };

    const view = render(
      <NitroPlayerView
        player={playerA}
        playerDefaults={defaultsA}
      />
    );
    await act(async () => undefined);

    expect(writes.surfaceType).toHaveBeenCalledTimes(1);
    expect(writes.controls).toHaveBeenCalledTimes(1);
    expect(writes.resizeMode).toHaveBeenCalledTimes(1);
    expect(writes.keepScreenAwake).toHaveBeenCalledTimes(1);
    expect(writes.player).toHaveBeenCalledTimes(1);
    expect(writes.player).toHaveBeenLastCalledWith(nativePlayerA);
    expect(manager.setPlayerDefaults).toHaveBeenCalledTimes(1);
    expect(manager.clearPlayerDefaults).not.toHaveBeenCalled();

    view.rerender(
      <NitroPlayerView
        player={playerA}
        playerDefaults={defaultsEquivalent}
        resizeMode="cover"
      />
    );
    await act(async () => undefined);

    expect(writes.surfaceType).toHaveBeenCalledTimes(1);
    expect(writes.controls).toHaveBeenCalledTimes(1);
    expect(writes.resizeMode).toHaveBeenCalledTimes(2);
    expect(writes.resizeMode).toHaveBeenLastCalledWith('cover');
    expect(writes.keepScreenAwake).toHaveBeenCalledTimes(1);
    expect(writes.player).toHaveBeenCalledTimes(1);
    expect(manager.setPlayerDefaults).toHaveBeenCalledTimes(1);

    view.rerender(
      <NitroPlayerView
        player={playerB}
        playerDefaults={defaultsChanged}
        resizeMode="cover"
      />
    );
    await act(async () => undefined);

    expect(writes.player).toHaveBeenCalledTimes(2);
    expect(writes.player).toHaveBeenLastCalledWith(nativePlayerB);
    expect(manager.setPlayerDefaults).toHaveBeenCalledTimes(2);
    expect(manager.setPlayerDefaults).toHaveBeenLastCalledWith(defaultsChanged);
    expect(writes.resizeMode).toHaveBeenCalledTimes(2);
  });
});
