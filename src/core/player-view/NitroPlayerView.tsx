import * as React from 'react';
import type { ViewProps, ViewStyle } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import type { ListenerSubscription } from '../../spec/nitro/NitroPlayerEventEmitter.nitro';
import type {
  SurfaceType,
  NitroPlayerViewManager,
  NitroPlayerViewManagerFactory,
} from '../../spec/nitro/NitroPlayerViewManager.nitro';
import { type NitroPlayerViewEvents } from '../types/Events';
import type { ResizeMode } from '../types/ResizeMode';
import type { NitroPlayerConfig, NitroPlayerSource } from '../types/NitroPlayerConfig';
import {
  tryParseNativeNitroPlayerError,
  NitroPlayerComponentError,
  NitroPlayerError,
} from '../types/NitroPlayerError';
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
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  addEventListener: <Event extends keyof NitroPlayerViewEvents>(
    event: Event,
    callback: NitroPlayerViewEvents[Event]
  ) => ListenerSubscription;
}

let nitroIdCounter = 1;
const NitroPlayerViewManagerFactory =
  NitroModules.createHybridObject<NitroPlayerViewManagerFactory>(
    'NitroPlayerViewManagerFactory'
  );

const wrapNativeViewManagerFunction = <T,>(
  manager: NitroPlayerViewManager | null,
  func: (manager: NitroPlayerViewManager) => T
) => {
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
  props: Omit<NitroPlayerViewProps, 'source' | 'setup'>
) => {
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
      onFullscreenChange,
      willEnterFullscreen,
      willExitFullscreen,
      ...props
    },
    ref
  ) => {
    const player = useNitroPlayer(source, setup, {
      defaultMemoryProfile: 'feed',
    });
    const nitroId = React.useMemo(() => nitroIdCounter++, []);
    const nitroViewManager = React.useRef<NitroPlayerViewManager | null>(null);
    const [isManagerReady, setIsManagerReady] = React.useState(false);

    const setupViewManager = React.useCallback(
      (id: number) => {
        try {
          if (nitroViewManager.current === null) {
            nitroViewManager.current =
              NitroPlayerViewManagerFactory.createViewManager(id);

            if (!nitroViewManager.current) {
              throw new NitroPlayerError(
                'view/not-found',
                'Failed to create View Manager'
              );
            }
          }

          setIsManagerReady(true);
        } catch (error) {
          const parsedError = tryParseNativeNitroPlayerError(error);

          if (
            parsedError instanceof NitroPlayerComponentError &&
            parsedError.code === 'view/not-found'
          ) {
            if (id === nitroId) {
              console.warn(
                '[NitroPlay] NitroPlayerView was unmounted before native manager was able to find it.'
              );
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
        enterFullscreen: () => {
          wrapNativeViewManagerFunction(nitroViewManager.current, (manager) => {
            manager.enterFullscreen();
          });
        },
        exitFullscreen: () => {
          wrapNativeViewManagerFunction(nitroViewManager.current, (manager) => {
            manager.exitFullscreen();
          });
        },
        addEventListener: <Event extends keyof NitroPlayerViewEvents>(
          event: Event,
          callback: NitroPlayerViewEvents[Event]
        ): ListenerSubscription => {
          return wrapNativeViewManagerFunction(
            nitroViewManager.current,
            (manager) => {
              switch (event) {
                case 'onFullscreenChange':
                  return manager.addOnFullscreenChangeListener(
                    callback as NitroPlayerViewEvents['onFullscreenChange']
                  );
                case 'willEnterFullscreen':
                  return manager.addWillEnterFullscreenListener(
                    callback as NitroPlayerViewEvents['willEnterFullscreen']
                  );
                case 'willExitFullscreen':
                  return manager.addWillExitFullscreenListener(
                    callback as NitroPlayerViewEvents['willExitFullscreen']
                  );
                default:
                  throw new Error(
                    `[NitroPlay] Unsupported event: ${event}`
                  );
              }
            }
          );
        },
      }),
      [player]
    );

    React.useEffect(() => {
      return () => {
        if (nitroViewManager.current) {
          nitroViewManager.current.clearAllListeners();
          setIsManagerReady(false);
        }
      };
    }, []);

    React.useEffect(() => {
      if (!nitroViewManager.current) {
        return;
      }

      const subscriptions: ListenerSubscription[] = [];

      if (onFullscreenChange) {
        subscriptions.push(
          nitroViewManager.current.addOnFullscreenChangeListener(
            onFullscreenChange
          )
        );
      }
      if (willEnterFullscreen) {
        subscriptions.push(
          nitroViewManager.current.addWillEnterFullscreenListener(
            willEnterFullscreen
          )
        );
      }
      if (willExitFullscreen) {
        subscriptions.push(
          nitroViewManager.current.addWillExitFullscreenListener(
            willExitFullscreen
          )
        );
      }

      return () => {
        subscriptions.forEach((sub) => sub.remove());
      };
    }, [
      onFullscreenChange,
      willEnterFullscreen,
      willExitFullscreen,
      isManagerReady,
    ]);

    React.useEffect(() => {
      if (!nitroViewManager.current) {
        return;
      }

      updateNativeProps(nitroViewManager.current, player, {
        ...props,
        controls,
        resizeMode,
      });
    }, [
      player,
      controls,
      resizeMode,
      props,
      isManagerReady,
    ]);

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
