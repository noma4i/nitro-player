import * as React from 'react';
import type { ViewProps, ViewStyle } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import type { ListenerSubscription } from '../bridge/nitro/NitroPlayerEventEmitter.nitro';
import type { SurfaceType, NitroPlayerViewManager, NitroPlayerViewManagerFactory } from '../bridge/nitro/NitroPlayerViewManager.nitro';
import { type NitroPlayerViewEvents } from './events';
import type { ResizeMode } from './types/ResizeMode';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig';
import type { NitroPlayerDefaults } from '../player/types/NitroPlayerDefaults';
import { tryParseNativeNitroPlayerError, NitroPlayerError } from '../support/errors/NitroPlayerError';
import { NitroPlayer } from '../player/NitroPlayer';
import { useNitroPlayer } from '../player/hooks/useNitroPlayer';
import { NativeNitroPlayerView } from './NativeNitroPlayerView';

interface NitroPlayerViewBaseProps extends Partial<NitroPlayerViewEvents>, ViewProps {
  playerDefaults?: NitroPlayerDefaults;
  style?: ViewStyle;
  controls?: boolean;
  resizeMode?: ResizeMode;
  keepScreenAwake?: boolean;
  surfaceType?: SurfaceType;
}

export type NitroPlayerViewProps = NitroPlayerViewBaseProps & ({ source: NitroSourceInput; player?: never } | { player: NitroPlayer; source?: never });

export interface NitroPlayerViewRef {
  player: NitroPlayer;
  isAttached: boolean;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  addEventListener: <Event extends keyof NitroPlayerViewEvents>(event: Event, callback: NitroPlayerViewEvents[Event]) => ListenerSubscription;
}

let nitroIdCounter = 1;
const NitroPlayerViewManagerFactory = NitroModules.createHybridObject<NitroPlayerViewManagerFactory>('NitroPlayerViewManagerFactory');

const wrapNativeViewManagerFunction = <T,>(manager: NitroPlayerViewManager | null, func: (manager: NitroPlayerViewManager) => T) => {
  try {
    if (manager === null) {
      throw new NitroPlayerError('view/not-found', 'View manager not found');
    }
    return func(manager);
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};

const isViewNotFound = (error: unknown): error is { code: 'view/not-found' } => typeof error === 'object' && error !== null && 'code' in error && error.code === 'view/not-found';

type NitroPlayerSurfaceProps = NitroPlayerViewBaseProps & {
  player: NitroPlayer;
};

const shallowEqualPlayerDefaults = (previous: NitroPlayerDefaults | undefined, next: NitroPlayerDefaults | undefined): boolean => {
  if (previous === next) {
    return true;
  }
  if (!previous || !next) {
    return false;
  }

  const previousKeys = Object.keys(previous) as (keyof NitroPlayerDefaults)[];
  const nextKeys = Object.keys(next) as (keyof NitroPlayerDefaults)[];
  return previousKeys.length === nextKeys.length && previousKeys.every(key => Object.is(previous[key], next[key]));
};

const NitroPlayerViewSurface = React.forwardRef<NitroPlayerViewRef, NitroPlayerSurfaceProps>(
  (
    {
      player,
      playerDefaults,
      controls = false,
      resizeMode = 'none',
      keepScreenAwake = true,
      surfaceType = 'surface',
      onAttached,
      onDetached,
      onFullscreenChange,
      willEnterFullscreen,
      willExitFullscreen,
      ...props
    },
    ref
  ) => {
    const nitroId = React.useMemo(() => nitroIdCounter++, []);
    const nitroViewManager = React.useRef<NitroPlayerViewManager | null>(null);
    const [isManagerReady, setIsManagerReady] = React.useState(false);
    const [isAttached, setIsAttached] = React.useState(false);
    const lastDeliveredAttachStateRef = React.useRef(false);
    const onAttachedRef = React.useRef(onAttached);
    const onDetachedRef = React.useRef(onDetached);
    const onFullscreenChangeRef = React.useRef(onFullscreenChange);
    const willEnterFullscreenRef = React.useRef(willEnterFullscreen);
    const willExitFullscreenRef = React.useRef(willExitFullscreen);
    const lastPlayerDefaultsRef = React.useRef<NitroPlayerDefaults | undefined>(undefined);
    const hasWrittenPlayerDefaultsRef = React.useRef(false);

    onAttachedRef.current = onAttached;
    onDetachedRef.current = onDetached;
    onFullscreenChangeRef.current = onFullscreenChange;
    willEnterFullscreenRef.current = willEnterFullscreen;
    willExitFullscreenRef.current = willExitFullscreen;

    const setupViewManager = React.useCallback((id: number) => {
      try {
        if (nitroViewManager.current === null) {
          const manager = NitroPlayerViewManagerFactory.createViewManager(id);

          if (!manager) {
            console.warn('[NitroPlay] NitroPlayerView native view disappeared before manager attach completed; waiting for the next native attach event.');
            return;
          }

          nitroViewManager.current = manager;
        }

        setIsAttached(nitroViewManager.current.isAttached);
        setIsManagerReady(true);
      } catch (error) {
        const parsedError = tryParseNativeNitroPlayerError(error);

        if (isViewNotFound(parsedError)) {
          console.warn('[NitroPlay] NitroPlayerView native view disappeared before manager attach completed; waiting for the next native attach event.');
          return;
        }

        throw parsedError;
      }
    }, []);

    const onNitroIdChange = React.useCallback(
      (event: { nativeEvent: { nitroId: number } }) => {
        setupViewManager(event.nativeEvent.nitroId);
      },
      [setupViewManager]
    );

    React.useImperativeHandle(
      ref,
      () => ({
        player,
        isAttached,
        enterFullscreen: () => {
          wrapNativeViewManagerFunction(nitroViewManager.current, manager => {
            manager.enterFullscreen();
          });
        },
        exitFullscreen: () => {
          wrapNativeViewManagerFunction(nitroViewManager.current, manager => {
            manager.exitFullscreen();
          });
        },
        addEventListener: <Event extends keyof NitroPlayerViewEvents>(event: Event, callback: NitroPlayerViewEvents[Event]): ListenerSubscription => {
          return wrapNativeViewManagerFunction(nitroViewManager.current, manager => {
            switch (event) {
              case 'onAttached':
                return manager.addOnAttachedListener(() => {
                  (callback as NitroPlayerViewEvents['onAttached'])(player);
                });
              case 'onDetached':
                return manager.addOnDetachedListener(callback as NitroPlayerViewEvents['onDetached']);
              case 'onFullscreenChange':
                return manager.addOnFullscreenChangeListener(callback as NitroPlayerViewEvents['onFullscreenChange']);
              case 'willEnterFullscreen':
                return manager.addWillEnterFullscreenListener(callback as NitroPlayerViewEvents['willEnterFullscreen']);
              case 'willExitFullscreen':
                return manager.addWillExitFullscreenListener(callback as NitroPlayerViewEvents['willExitFullscreen']);
              default:
                throw new Error(`[NitroPlay] Unsupported event: ${event}`);
            }
          });
        }
      }),
      [isAttached, player]
    );

    React.useEffect(() => {
      return () => {
        if (nitroViewManager.current) {
          nitroViewManager.current.clearAllListeners();
        }
        nitroViewManager.current = null;
        lastDeliveredAttachStateRef.current = false;
        hasWrittenPlayerDefaultsRef.current = false;
        lastPlayerDefaultsRef.current = undefined;
      };
    }, []);

    React.useEffect(() => {
      if (!isManagerReady || !nitroViewManager.current) {
        return;
      }

      const subscriptions: ListenerSubscription[] = [];
      const manager = nitroViewManager.current;

      subscriptions.push(
        manager.addOnAttachedListener(() => {
          setIsAttached(true);
          if (!lastDeliveredAttachStateRef.current) {
            lastDeliveredAttachStateRef.current = true;
            onAttachedRef.current?.(player);
          }
        })
      );
      subscriptions.push(
        manager.addOnDetachedListener(() => {
          setIsAttached(false);
          if (lastDeliveredAttachStateRef.current) {
            lastDeliveredAttachStateRef.current = false;
            onDetachedRef.current?.();
          }
        })
      );
      subscriptions.push(manager.addOnFullscreenChangeListener(fullscreen => onFullscreenChangeRef.current?.(fullscreen)));
      subscriptions.push(manager.addWillEnterFullscreenListener(() => willEnterFullscreenRef.current?.()));
      subscriptions.push(manager.addWillExitFullscreenListener(() => willExitFullscreenRef.current?.()));

      if (manager.isAttached && !lastDeliveredAttachStateRef.current) {
        lastDeliveredAttachStateRef.current = true;
        setIsAttached(true);
        onAttachedRef.current?.(player);
      }

      return () => {
        subscriptions.forEach(sub => sub.remove());
      };
    }, [isManagerReady, player]);

    React.useEffect(() => {
      if (!isManagerReady || !nitroViewManager.current) {
        return;
      }

      nitroViewManager.current.surfaceType = surfaceType;
    }, [isManagerReady, surfaceType]);

    React.useEffect(() => {
      if (!isManagerReady || !nitroViewManager.current) {
        return;
      }

      nitroViewManager.current.controls = controls;
    }, [controls, isManagerReady]);

    React.useEffect(() => {
      if (!isManagerReady || !nitroViewManager.current) {
        return;
      }

      nitroViewManager.current.resizeMode = resizeMode;
    }, [isManagerReady, resizeMode]);

    React.useEffect(() => {
      if (!isManagerReady || !nitroViewManager.current) {
        return;
      }

      nitroViewManager.current.keepScreenAwake = keepScreenAwake;
    }, [isManagerReady, keepScreenAwake]);

    React.useEffect(() => {
      if (!isManagerReady || !nitroViewManager.current) {
        return;
      }

      nitroViewManager.current.player = player.__getNativePlayer();
    }, [isManagerReady, player]);

    React.useEffect(() => {
      if (!isManagerReady || !nitroViewManager.current) {
        return;
      }
      if (hasWrittenPlayerDefaultsRef.current && shallowEqualPlayerDefaults(lastPlayerDefaultsRef.current, playerDefaults)) {
        return;
      }

      lastPlayerDefaultsRef.current = playerDefaults;
      hasWrittenPlayerDefaultsRef.current = true;
      if (playerDefaults) {
        nitroViewManager.current.setPlayerDefaults(playerDefaults);
      } else {
        nitroViewManager.current.clearPlayerDefaults();
      }
    }, [isManagerReady, playerDefaults]);

    return (
      <NativeNitroPlayerView
        nitroId={nitroId}
        onNitroIdChange={onNitroIdChange}
        {...props}
      />
    );
  }
);

const NitroPlayerViewWithSource = React.forwardRef<NitroPlayerViewRef, NitroPlayerViewBaseProps & { source: NitroSourceInput }>(({ source, ...surfaceProps }, ref) => {
  const player = useNitroPlayer(source);
  return (
    <NitroPlayerViewSurface
      ref={ref}
      player={player}
      {...surfaceProps}
    />
  );
});

const NitroPlayerView = React.forwardRef<NitroPlayerViewRef, NitroPlayerViewProps>((props, ref) => {
  if ('player' in props && props.player) {
    const { player, ...surfaceProps } = props;
    return (
      <NitroPlayerViewSurface
        ref={ref}
        player={player}
        {...surfaceProps}
      />
    );
  }

  const { source, ...surfaceProps } = props;
  return (
    <NitroPlayerViewWithSource
      ref={ref}
      source={source}
      {...surfaceProps}
    />
  );
});

NitroPlayerViewSurface.displayName = 'NitroPlayerViewSurface';
NitroPlayerViewWithSource.displayName = 'NitroPlayerViewWithSource';
NitroPlayerView.displayName = 'NitroPlayerView';

const MemoizedNitroPlayerView = React.memo(NitroPlayerView);

export default MemoizedNitroPlayerView;
