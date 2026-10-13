import * as React from 'react';
import type { ViewProps, ViewStyle } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import type { ListenerSubscription } from '../bridge/nitro/NitroPlayerEventEmitter.nitro';
import type { NitroPlayerViewManager, NitroPlayerViewManagerFactory, SurfaceType } from '../bridge/nitro/NitroPlayerViewManager.nitro';
import { NitroPlayer } from '../player/NitroPlayer';
import type { NitroPlayerDefaults } from '../player/types/NitroPlayerDefaults';
import { NitroPlayerError, tryParseNativeNitroPlayerError } from '../support/errors/NitroPlayerError';
import { type NitroPlayerViewEvents } from './events';
import { NativeNitroPlayerView } from './NativeNitroPlayerView';
import type { ResizeMode } from './types/ResizeMode';

export interface NitroPlayerViewBaseProps extends Partial<NitroPlayerViewEvents>, ViewProps {
  playerDefaults?: NitroPlayerDefaults;
  style?: ViewStyle;
  controls?: boolean;
  resizeMode?: ResizeMode;
  keepScreenAwake?: boolean;
  surfaceType?: SurfaceType;
}

export type NitroPlayerViewProps = NitroPlayerViewBaseProps & { player: NitroPlayer };

export interface NitroPlayerViewRef {
  player: NitroPlayer;
  isAttached: boolean;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  addEventListener: <Event extends keyof NitroPlayerViewEvents>(event: Event, callback: NitroPlayerViewEvents[Event]) => ListenerSubscription;
}

let nitroIdCounter = 1;
const nitroPlayerViewManagerFactory = NitroModules.createHybridObject<NitroPlayerViewManagerFactory>('NitroPlayerViewManagerFactory');

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

const updateNativeProps = (
  manager: NitroPlayerViewManager,
  player: NitroPlayer,
  defaults: NitroPlayerDefaults | undefined,
  props: Omit<NitroPlayerViewBaseProps, 'playerDefaults'>
) => {
  manager.surfaceType = props.surfaceType ?? 'surface';
  manager.controls = props.controls ?? false;
  manager.resizeMode = props.resizeMode ?? 'none';
  manager.keepScreenAwake = props.keepScreenAwake ?? true;
  if (defaults) {
    manager.setPlayerDefaults(defaults);
  } else {
    manager.clearPlayerDefaults();
  }
  manager.player = player.__getNativePlayer();
};

const isViewNotFound = (error: unknown): error is { code: 'view/not-found' } => typeof error === 'object' && error !== null && 'code' in error && error.code === 'view/not-found';

type NitroPlayerSurfaceProps = NitroPlayerViewBaseProps & {
  player: NitroPlayer;
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
    const [managerGeneration, setManagerGeneration] = React.useState(0);
    const [isAttached, setIsAttached] = React.useState(false);
    const lastDeliveredAttachStateRef = React.useRef(false);

    const setupViewManager = React.useCallback((id: number) => {
      try {
        if (nitroViewManager.current === null) {
          const manager = nitroPlayerViewManagerFactory.createViewManager(id);

          if (!manager) {
            console.warn('[NitroPlay] NitroPlayerView native view disappeared before manager attach completed; waiting for the next native attach event.');
            return;
          }

          nitroViewManager.current = manager;
          setManagerGeneration(generation => generation + 1);
        }

        setIsAttached(nitroViewManager.current.isAttached);
      } catch (error) {
        const parsedError = tryParseNativeNitroPlayerError(error);

        if (isViewNotFound(parsedError)) {
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
      setupViewManager(nitroId);

      return () => {
        if (nitroViewManager.current) {
          nitroViewManager.current.clearAllListeners();
        }
        nitroViewManager.current = null;
        lastDeliveredAttachStateRef.current = false;
      };
    }, [nitroId, setupViewManager]);

    React.useEffect(() => {
      if (!nitroViewManager.current) {
        return;
      }

      updateNativeProps(nitroViewManager.current, player, playerDefaults, {
        controls,
        resizeMode,
        keepScreenAwake,
        surfaceType
      });
    }, [player, playerDefaults, controls, resizeMode, keepScreenAwake, surfaceType, managerGeneration]);

    React.useEffect(() => {
      if (!nitroViewManager.current) {
        return;
      }

      const subscriptions: ListenerSubscription[] = [];
      const manager = nitroViewManager.current;

      subscriptions.push(
        manager.addOnAttachedListener(() => {
          setIsAttached(true);
          if (!lastDeliveredAttachStateRef.current) {
            lastDeliveredAttachStateRef.current = true;
            onAttached?.(player);
          }
        })
      );
      subscriptions.push(
        manager.addOnDetachedListener(() => {
          setIsAttached(false);
          if (lastDeliveredAttachStateRef.current) {
            lastDeliveredAttachStateRef.current = false;
            onDetached?.();
          }
        })
      );
      if (onFullscreenChange) {
        subscriptions.push(manager.addOnFullscreenChangeListener(onFullscreenChange));
      }
      if (willEnterFullscreen) {
        subscriptions.push(manager.addWillEnterFullscreenListener(willEnterFullscreen));
      }
      if (willExitFullscreen) {
        subscriptions.push(manager.addWillExitFullscreenListener(willExitFullscreen));
      }

      if (manager.isAttached && !lastDeliveredAttachStateRef.current) {
        lastDeliveredAttachStateRef.current = true;
        setIsAttached(true);
        onAttached?.(player);
      }

      return () => {
        subscriptions.forEach(sub => sub.remove());
      };
    }, [managerGeneration, onAttached, onDetached, onFullscreenChange, player, willEnterFullscreen, willExitFullscreen]);

    return (
      <NativeNitroPlayerView
        nitroId={nitroId}
        onNitroIdChange={onNitroIdChange}
        {...props}
      />
    );
  }
);

const NitroPlayerView = React.forwardRef<NitroPlayerViewRef, NitroPlayerViewProps>(({ player, ...surfaceProps }, ref) => {
  return (
    <NitroPlayerViewSurface
      ref={ref}
      player={player}
      {...surfaceProps}
    />
  );
});

NitroPlayerViewSurface.displayName = 'NitroPlayerViewSurface';
NitroPlayerView.displayName = 'NitroPlayerView';

export default React.memo(NitroPlayerView);
