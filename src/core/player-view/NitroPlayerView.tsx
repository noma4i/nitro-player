import * as React from 'react';
import type { ViewProps, ViewStyle } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import type { ListenerSubscription } from '../../spec/nitro/NitroPlayerEventEmitter.nitro';
import type { SurfaceType, NitroPlayerViewManager, NitroPlayerViewManagerFactory } from '../../spec/nitro/NitroPlayerViewManager.nitro';
import { type NitroPlayerViewEvents } from '../types/Events';
import type { ResizeMode } from '../types/ResizeMode';
import type { NitroPlayerConfig, NitroPlayerSource } from '../types/NitroPlayerConfig';
import { tryParseNativeNitroPlayerError, NitroPlayerComponentError, NitroPlayerError } from '../types/NitroPlayerError';
import { NitroPlayer } from '../NitroPlayer';
import { useNitroPlayer } from '../hooks/useNitroPlayer';
import { NativeNitroPlayerView } from './NativeNitroPlayerView';

export interface NitroPlayerViewProps extends Partial<NitroPlayerViewEvents>, ViewProps {
  source: NitroPlayerConfig | NitroPlayerSource;
  setup?: (player: NitroPlayer) => void;
  style?: ViewStyle;
  controls?: boolean;
  resizeMode?: ResizeMode;
  keepScreenAwake?: boolean;
  surfaceType?: SurfaceType;
}

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

const updateNativeProps = (manager: NitroPlayerViewManager, player: NitroPlayer, props: Omit<NitroPlayerViewProps, 'source' | 'setup'>) => {
  manager.surfaceType = props.surfaceType ?? 'surface';
  manager.controls = props.controls ?? false;
  manager.resizeMode = props.resizeMode ?? 'none';
  manager.keepScreenAwake = props.keepScreenAwake ?? true;
  manager.player = player.__getNativePlayer();
};

const NitroPlayerView = React.forwardRef<NitroPlayerViewRef, NitroPlayerViewProps>(
  (
    {
      source,
      setup,
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
    const player = useNitroPlayer(source, setup, {
      defaultMemoryProfile: 'balanced'
    });
    const nitroId = React.useMemo(() => nitroIdCounter++, []);
    const nitroViewManager = React.useRef<NitroPlayerViewManager | null>(null);
    const [isManagerReady, setIsManagerReady] = React.useState(false);
    const [isAttached, setIsAttached] = React.useState(false);
    const lastDeliveredAttachStateRef = React.useRef(false);

    const setupViewManager = React.useCallback(
      (id: number) => {
        try {
          if (nitroViewManager.current === null) {
            nitroViewManager.current = NitroPlayerViewManagerFactory.createViewManager(id);

            if (!nitroViewManager.current) {
              throw new NitroPlayerError('view/not-found', 'Failed to create View Manager');
            }
          }

          setIsAttached(nitroViewManager.current.isAttached);
          setIsManagerReady(true);
        } catch (error) {
          const parsedError = tryParseNativeNitroPlayerError(error);

          if (parsedError instanceof NitroPlayerComponentError && parsedError.code === 'view/not-found') {
            if (id === nitroId) {
              console.warn('[NitroPlay] NitroPlayerView was unmounted before native manager was able to find it.');
              return;
            }
          }

          throw parsedError;
        }
      },
      [nitroId]
    );

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
        lastDeliveredAttachStateRef.current = false;
        setIsAttached(false);
        setIsManagerReady(false);
      };
    }, []);

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
    }, [isManagerReady, onAttached, onDetached, onFullscreenChange, player, willEnterFullscreen, willExitFullscreen]);

    React.useEffect(() => {
      if (!nitroViewManager.current) {
        return;
      }

      updateNativeProps(nitroViewManager.current, player, {
        controls,
        resizeMode,
        keepScreenAwake,
        surfaceType
      });
    }, [player, controls, resizeMode, keepScreenAwake, surfaceType, isManagerReady]);

    return (
      <NativeNitroPlayerView
        nitroId={nitroId}
        onNitroIdChange={onNitroIdChange}
        {...props}
      />
    );
  }
);

NitroPlayerView.displayName = 'NitroPlayerView';

export default React.memo(NitroPlayerView);
