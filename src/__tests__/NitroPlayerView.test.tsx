import type { ListenerSubscription } from '../spec/nitro/NitroPlayerEventEmitter.nitro';

type ListenerSets = {
  onAttached: Set<() => void>;
  onDetached: Set<() => void>;
  onFullscreenChange: Set<(fullscreen: boolean) => void>;
  willEnterFullscreen: Set<() => void>;
  willExitFullscreen: Set<() => void>;
};

const createListeners = (): ListenerSets => ({
  onAttached: new Set<() => void>(),
  onDetached: new Set<() => void>(),
  onFullscreenChange: new Set<(fullscreen: boolean) => void>(),
  willEnterFullscreen: new Set<() => void>(),
  willExitFullscreen: new Set<() => void>()
});

const createSubscription = <T extends Function>(set: Set<T>, callback: T): ListenerSubscription => {
  set.add(callback);
  return {
    remove: () => {
      set.delete(callback);
    }
  };
};

const setupSubject = (initiallyAttached = false) => {
  jest.resetModules();

  const listeners = createListeners();
  const mockManager = {
    player: undefined,
    isAttached: initiallyAttached,
    controls: false,
    resizeMode: 'none',
    keepScreenAwake: true,
    surfaceType: 'surface',
    enterFullscreen: jest.fn(),
    exitFullscreen: jest.fn(),
    addOnAttachedListener: jest.fn((callback: () => void) => createSubscription(listeners.onAttached, callback)),
    addOnDetachedListener: jest.fn((callback: () => void) => createSubscription(listeners.onDetached, callback)),
    addOnFullscreenChangeListener: jest.fn((callback: (fullscreen: boolean) => void) => createSubscription(listeners.onFullscreenChange, callback)),
    addWillEnterFullscreenListener: jest.fn((callback: () => void) => createSubscription(listeners.willEnterFullscreen, callback)),
    addWillExitFullscreenListener: jest.fn((callback: () => void) => createSubscription(listeners.willExitFullscreen, callback)),
    clearAllListeners: jest.fn(() => {
      listeners.onAttached.clear();
      listeners.onDetached.clear();
      listeners.onFullscreenChange.clear();
      listeners.willEnterFullscreen.clear();
      listeners.willExitFullscreen.clear();
    })
  };

  const mockPlayer = {
    __getNativePlayer: jest.fn(() => ({ name: 'native-player' }))
  };
  const useNitroPlayer = jest.fn(() => mockPlayer);

  jest.doMock('react-native-nitro-modules', () => ({
    NitroModules: {
      createHybridObject: jest.fn(() => ({
        createViewManager: jest.fn(() => mockManager)
      }))
    }
  }));

  jest.doMock('../core/hooks/useNitroPlayer', () => ({
    useNitroPlayer
  }));

  jest.doMock('../core/player-view/NativeNitroPlayerView', () => {
    const React = require('react') as typeof import('react');

    const MockNativeNitroPlayerView = ({ onNitroIdChange }: { onNitroIdChange?: (event: { nativeEvent: { nitroId: number } }) => void }) => {
      React.useEffect(() => {
        onNitroIdChange?.({ nativeEvent: { nitroId: 101 } });
      }, [onNitroIdChange]);

      return React.createElement('div', { 'data-testid': 'nitro-player-view' });
    };

    return {
      NativeNitroPlayerView: MockNativeNitroPlayerView
    };
  });

  const React = require('react') as typeof import('react');
  const ReactDOMClient = require('react-dom/client') as { createRoot: (container: Element) => { render: (node: unknown) => void } };
  const { default: NitroPlayerView } = require('../core/player-view/NitroPlayerView') as typeof import('../core/player-view/NitroPlayerView');
  const container = global.document.createElement('div');
  const root = ReactDOMClient.createRoot(container);

  return {
    React,
    act: React.act,
    renderNode: (node: unknown) => root.render(node),
    NitroPlayerView,
    listeners,
    useNitroPlayer
  };
};

describe('NitroPlayerView attach contract', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('delivers initial attached state via callback and ref.isAttached', () => {
    const { React, act, renderNode, NitroPlayerView } = setupSubject(true);
    const onAttached = jest.fn();
    const ref = React.createRef<any>();

    act(() => {
      renderNode(
        React.createElement(NitroPlayerView, {
          ref,
          source: { uri: 'https://cdn.example.com/video.mp4' },
          onAttached
        })
      );
    });

    expect(onAttached).toHaveBeenCalledTimes(1);
    expect(ref.current?.isAttached).toBe(true);
  });

  it('updates ref.isAttached on attach and detach events', () => {
    const { React, act, renderNode, NitroPlayerView, listeners } = setupSubject(false);
    const ref = React.createRef<any>();

    act(() => {
      renderNode(
        React.createElement(NitroPlayerView, {
          ref,
          source: { uri: 'https://cdn.example.com/video.mp4' }
        })
      );
    });

    expect(ref.current?.isAttached).toBe(false);

    act(() => {
      listeners.onAttached.forEach(callback => callback());
    });

    expect(ref.current?.isAttached).toBe(true);

    act(() => {
      listeners.onDetached.forEach(callback => callback());
    });

    expect(ref.current?.isAttached).toBe(false);
  });

  it('supports addEventListener for attach lifecycle events', () => {
    const { React, act, renderNode, NitroPlayerView, listeners } = setupSubject(false);
    const ref = React.createRef<any>();
    const onAttached = jest.fn();
    const onDetached = jest.fn();

    act(() => {
      renderNode(
        React.createElement(NitroPlayerView, {
          ref,
          source: { uri: 'https://cdn.example.com/video.mp4' }
        })
      );
    });

    const attachedSubscription = ref.current?.addEventListener('onAttached', onAttached);
    const detachedSubscription = ref.current?.addEventListener('onDetached', onDetached);

    act(() => {
      listeners.onAttached.forEach(callback => callback());
      listeners.onDetached.forEach(callback => callback());
    });

    expect(onAttached).toHaveBeenCalledTimes(1);
    expect(onDetached).toHaveBeenCalledTimes(1);

    attachedSubscription?.remove();
    detachedSubscription?.remove();
  });

  it('creates NitroPlayerView players with balanced default memory profile', () => {
    const { React, act, renderNode, NitroPlayerView, useNitroPlayer } = setupSubject(false);

    act(() => {
      renderNode(
        React.createElement(NitroPlayerView, {
          source: { uri: 'https://cdn.example.com/video.mp4' }
        })
      );
    });

    expect(useNitroPlayer).toHaveBeenCalledWith(
      { uri: 'https://cdn.example.com/video.mp4' },
      undefined,
      expect.objectContaining({
        defaultMemoryProfile: 'balanced'
      })
    );
  });
});
