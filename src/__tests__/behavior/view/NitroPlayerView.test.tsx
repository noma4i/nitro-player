import type { ListenerSubscription } from '../../../bridge/nitro/NitroPlayerEventEmitter.nitro';

type ListenerSets = {
  onAttached: Set<() => void>;
  onDetached: Set<() => void>;
  onFullscreenChange: Set<(fullscreen: boolean) => void>;
  willEnterFullscreen: Set<() => void>;
  willExitFullscreen: Set<() => void>;
};

type SetupOptions = {
  initiallyAttached?: boolean;
  nativeNitroIds?: number[];
  createViewManager?: (nitroId: number, manager: ReturnType<typeof createMockManager>) => ReturnType<typeof createMockManager> | null;
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

const createMockManager = (listeners: ListenerSets, initiallyAttached: boolean) => ({
  player: undefined,
  isAttached: initiallyAttached,
  controls: false,
  resizeMode: 'none',
  keepScreenAwake: true,
  surfaceType: 'surface',
  setPlayerDefaults: jest.fn(),
  clearPlayerDefaults: jest.fn(),
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
});

const normalizeSetupOptions = (optionsOrInitiallyAttached: boolean | SetupOptions): SetupOptions => {
  if (typeof optionsOrInitiallyAttached === 'boolean') {
    return { initiallyAttached: optionsOrInitiallyAttached };
  }

  return optionsOrInitiallyAttached;
};

const setupSubject = (optionsOrInitiallyAttached: boolean | SetupOptions = false) => {
  jest.resetModules();

  const options = normalizeSetupOptions(optionsOrInitiallyAttached);
  const listeners = createListeners();
  const mockManager = createMockManager(listeners, options.initiallyAttached ?? false);
  const createViewManager = jest.fn((nitroId: number) => {
    if (options.createViewManager) {
      return options.createViewManager(nitroId, mockManager);
    }

    return mockManager;
  });
  const nativeNitroIds = options.nativeNitroIds ?? [101];

  const mockPlayer = {
    __getNativePlayer: jest.fn(() => ({ name: 'native-player' }))
  };
  const useNitroPlayer = jest.fn(() => mockPlayer);

  jest.doMock('react-native-nitro-modules', () => ({
    NitroModules: {
      createHybridObject: jest.fn(() => ({
        createViewManager
      }))
    }
  }));

  jest.doMock('../../../player/hooks/useNitroPlayer', () => ({
    useNitroPlayer
  }));

  jest.doMock('../../../view/NativeNitroPlayerView', () => {
    const React = require('react') as typeof import('react');

    const MockNativeNitroPlayerView = ({ onNitroIdChange }: { onNitroIdChange?: (event: { nativeEvent: { nitroId: number } }) => void }) => {
      React.useEffect(() => {
        nativeNitroIds.forEach(nitroId => {
          onNitroIdChange?.({ nativeEvent: { nitroId } });
        });
      }, [onNitroIdChange]);

      return React.createElement('div', { 'data-testid': 'nitro-player-view' });
    };

    return {
      NativeNitroPlayerView: MockNativeNitroPlayerView
    };
  });

  const React = require('react') as typeof import('react');
  const ReactDOMClient = require('react-dom/client') as { createRoot: (container: Element) => { render: (node: unknown) => void } };
  const { default: NitroPlayerView } = require('../../../view/NitroPlayerView') as typeof import('../../../view/NitroPlayerView');
  const container = global.document.createElement('div');
  const root = ReactDOMClient.createRoot(container);

  return {
    React,
    act: React.act,
    renderNode: (node: unknown) => root.render(node),
    NitroPlayerView,
    listeners,
    createViewManager,
    mockManager,
    useNitroPlayer
  };
};

describe('NitroPlayerView attach contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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

  it('applies playerDefaults through native view manager, not through useNitroPlayer defaults', () => {
    const { React, act, renderNode, NitroPlayerView, useNitroPlayer } = setupSubject(false);

    act(() => {
      renderNode(
        React.createElement(NitroPlayerView, {
          source: { uri: 'https://cdn.example.com/video.mp4' },
          playerDefaults: { loop: true }
        })
      );
    });

    expect(useNitroPlayer).toHaveBeenCalledWith({ uri: 'https://cdn.example.com/video.mp4' });
  });

  it('does not redbox when a virtualized native view disappears before manager attach can resolve it', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const viewNotFound = new Error('{%@view/not-found::View with viewId 101 not found@%}');
    const { React, act, renderNode, NitroPlayerView, createViewManager } = setupSubject({
      initiallyAttached: true,
      nativeNitroIds: [101, 102],
      createViewManager: (nitroId, manager) => {
        if (nitroId === 101) {
          throw viewNotFound;
        }

        return manager;
      }
    });
    const ref = React.createRef<any>();

    expect(() => {
      act(() => {
        renderNode(
          React.createElement(NitroPlayerView, {
            ref,
            source: { uri: 'https://cdn.example.com/video.mp4' }
          })
        );
      });
    }).not.toThrow();

    expect(createViewManager).toHaveBeenNthCalledWith(1, 101);
    expect(createViewManager).toHaveBeenNthCalledWith(2, 102);
    expect(ref.current?.isAttached).toBe(true);
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('native view disappeared before manager attach completed'));

    consoleWarn.mockRestore();
  });

  it('retries when native manager creation returns null for a disappearing virtualized view', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { React, act, renderNode, NitroPlayerView, createViewManager } = setupSubject({
      initiallyAttached: true,
      nativeNitroIds: [201, 202],
      createViewManager: (nitroId, manager) => {
        if (nitroId === 201) {
          return null;
        }

        return manager;
      }
    });
    const ref = React.createRef<any>();

    expect(() => {
      act(() => {
        renderNode(
          React.createElement(NitroPlayerView, {
            ref,
            source: { uri: 'https://cdn.example.com/video.mp4' }
          })
        );
      });
    }).not.toThrow();

    expect(createViewManager).toHaveBeenNthCalledWith(1, 201);
    expect(createViewManager).toHaveBeenNthCalledWith(2, 202);
    expect(ref.current?.isAttached).toBe(true);
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('native view disappeared before manager attach completed'));

    consoleWarn.mockRestore();
  });

  it('stays detached when every native attach event races with view removal', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const viewNotFound = new Error('{%@view/not-found::View with viewId missing during churn@%}');
    const { React, act, renderNode, NitroPlayerView, createViewManager } = setupSubject({
      initiallyAttached: true,
      nativeNitroIds: [301, 302],
      createViewManager: () => {
        throw viewNotFound;
      }
    });
    const ref = React.createRef<any>();

    act(() => {
      renderNode(
        React.createElement(NitroPlayerView, {
          ref,
          source: { uri: 'https://cdn.example.com/video.mp4' }
        })
      );
    });

    expect(createViewManager).toHaveBeenCalledTimes(2);
    expect(ref.current?.isAttached).toBe(false);
    expect(consoleWarn).toHaveBeenCalledTimes(2);

    consoleWarn.mockRestore();
  });

  it('does not swallow native view errors that are not transient view-not-found misses', () => {
    const nativeFailure = new Error('{%@view/deallocated::View was already deallocated@%}');
    const { React, act, renderNode, NitroPlayerView } = setupSubject({
      nativeNitroIds: [401],
      createViewManager: () => {
        throw nativeFailure;
      }
    });

    expect(() => {
      act(() => {
        renderNode(
          React.createElement(NitroPlayerView, {
            source: { uri: 'https://cdn.example.com/video.mp4' }
          })
        );
      });
    }).toThrow('View was already deallocated');
  });
});
