import * as React from 'react';
import type { ViewProps, ViewStyle } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import type { ListenerSubscription } from '../../spec/nitro/VideoPlayerEventEmitter.nitro';
import type {
  SurfaceType,
  VideoViewViewManager,
  VideoViewViewManagerFactory,
} from '../../spec/nitro/VideoViewViewManager.nitro';
import { type VideoViewEvents } from '../types/Events';
import type { ResizeMode } from '../types/ResizeMode';
import type { VideoConfig, VideoSource } from '../types/VideoConfig';
import {
  tryParseNativeVideoError,
  VideoComponentError,
  VideoError,
} from '../types/VideoError';
import { VideoPlayer } from '../VideoPlayer';
import { useVideoPlayer } from '../hooks/useVideoPlayer';
import { NativeVideoView } from './NativeVideoView';

export interface VideoViewProps extends Partial<VideoViewEvents>, ViewProps {
  source: VideoConfig | VideoSource;
  setup?: (player: VideoPlayer) => void;
  style?: ViewStyle;
  controls?: boolean;
  resizeMode?: ResizeMode;
  keepScreenAwake?: boolean;
  surfaceType?: SurfaceType;
}

export interface VideoViewRef {
  player: VideoPlayer;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  addEventListener: <Event extends keyof VideoViewEvents>(
    event: Event,
    callback: VideoViewEvents[Event]
  ) => ListenerSubscription;
}

let nitroIdCounter = 1;
const VideoViewViewManagerFactory =
  NitroModules.createHybridObject<VideoViewViewManagerFactory>(
    'VideoViewViewManagerFactory'
  );

const wrapNativeViewManagerFunction = <T,>(
  manager: VideoViewViewManager | null,
  func: (manager: VideoViewViewManager) => T
) => {
  try {
    if (manager === null) {
      throw new VideoError('view/not-found', 'View manager not found');
    }
    return func(manager);
  } catch (error) {
    throw tryParseNativeVideoError(error);
  }
};

const updateNativeProps = (
  manager: VideoViewViewManager,
  player: VideoPlayer,
  props: Omit<VideoViewProps, 'source' | 'setup'>
) => {
  manager.surfaceType = props.surfaceType ?? 'surface';
  manager.controls = props.controls ?? false;
  manager.resizeMode = props.resizeMode ?? 'none';
  manager.keepScreenAwake = props.keepScreenAwake ?? true;
  manager.player = player.__getNativePlayer();
};

const VideoView = React.forwardRef<VideoViewRef, VideoViewProps>(
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
    const player = useVideoPlayer(source, setup, {
      defaultMemoryProfile: 'feed',
    });
    const nitroId = React.useMemo(() => nitroIdCounter++, []);
    const nitroViewManager = React.useRef<VideoViewViewManager | null>(null);
    const [isManagerReady, setIsManagerReady] = React.useState(false);

    const setupViewManager = React.useCallback(
      (id: number) => {
        try {
          if (nitroViewManager.current === null) {
            nitroViewManager.current =
              VideoViewViewManagerFactory.createViewManager(id);

            if (!nitroViewManager.current) {
              throw new VideoError(
                'view/not-found',
                'Failed to create View Manager'
              );
            }
          }

          setIsManagerReady(true);
        } catch (error) {
          const parsedError = tryParseNativeVideoError(error);

          if (
            parsedError instanceof VideoComponentError &&
            parsedError.code === 'view/not-found'
          ) {
            if (id === nitroId) {
              console.warn(
                '[JustPlayer] VideoView was unmounted before native manager was able to find it.'
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
        addEventListener: <Event extends keyof VideoViewEvents>(
          event: Event,
          callback: VideoViewEvents[Event]
        ): ListenerSubscription => {
          return wrapNativeViewManagerFunction(
            nitroViewManager.current,
            (manager) => {
              switch (event) {
                case 'onFullscreenChange':
                  return manager.addOnFullscreenChangeListener(
                    callback as VideoViewEvents['onFullscreenChange']
                  );
                case 'willEnterFullscreen':
                  return manager.addWillEnterFullscreenListener(
                    callback as VideoViewEvents['willEnterFullscreen']
                  );
                case 'willExitFullscreen':
                  return manager.addWillExitFullscreenListener(
                    callback as VideoViewEvents['willExitFullscreen']
                  );
                default:
                  throw new Error(
                    `[JustPlayer] Unsupported event: ${event}`
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
      <NativeVideoView
        nitroId={nitroId}
        onNitroIdChange={onNitroIdChange}
        {...props}
      />
    );
  }
);

VideoView.displayName = 'VideoView';

export default React.memo(VideoView);
