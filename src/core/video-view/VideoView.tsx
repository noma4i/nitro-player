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
  /**
   * Video source - URL string, asset number, or full VideoConfig.
   */
  source: VideoConfig | VideoSource;
  /**
   * Setup callback - configure the player when it's created.
   * @example
   * setup={(p) => { p.loop = true; p.volume = 0.5; }}
   */
  setup?: (player: VideoPlayer) => void;
  /**
   * The style of the video view - {@link ViewStyle}
   */
  style?: ViewStyle;
  /**
   * Whether to show the controls. Defaults to false.
   */
  controls?: boolean;
  /**
   * Whether to enable & show the picture in picture button in native controls. Defaults to false.
   */
  pictureInPicture?: boolean;
  /**
   * Whether to automatically enter picture in picture mode when the video is playing. Defaults to false.
   */
  autoEnterPictureInPicture?: boolean;
  /**
   * How the video should be resized to fit the view. Defaults to 'none'.
   * - 'contain': Scale the video uniformly (maintain aspect ratio) so that it fits entirely within the view
   * - 'cover': Scale the video uniformly (maintain aspect ratio) so that it fills the entire view (may crop)
   * - 'stretch': Scale the video to fill the entire view without maintaining aspect ratio
   * - 'none': Do not resize the video
   */
  resizeMode?: ResizeMode;
  /**
   * Whether to keep the screen awake while the video view is mounted. Defaults to true.
   */
  keepScreenAwake?: boolean;

  /**
   * The type of underlying native view. Defaults to 'surface'.
   * - 'surface': Uses a SurfaceView on Android. More performant, but cannot be animated or transformed.
   * - 'texture': Uses a TextureView on Android. Less performant, but can be animated and transformed.
   *
   * Only applicable on Android
   *
   * @default 'surface'
   * @platform android
   */
  surfaceType?: SurfaceType;
}

export interface VideoViewRef {
  /**
   * The player instance. Use for imperative control (play/pause/seek).
   */
  player: VideoPlayer;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  enterPictureInPicture: () => void;
  exitPictureInPicture: () => void;
  canEnterPictureInPicture: () => boolean;
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
  manager.pictureInPicture = props.pictureInPicture ?? false;
  manager.autoEnterPictureInPicture = props.autoEnterPictureInPicture ?? false;
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
      pictureInPicture = false,
      autoEnterPictureInPicture = false,
      resizeMode = 'none',
      onPictureInPictureChange,
      onFullscreenChange,
      willEnterFullscreen,
      willExitFullscreen,
      willEnterPictureInPicture,
      willExitPictureInPicture,
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
        enterPictureInPicture: () => {
          wrapNativeViewManagerFunction(nitroViewManager.current, (manager) => {
            manager.enterPictureInPicture();
          });
        },
        exitPictureInPicture: () => {
          wrapNativeViewManagerFunction(nitroViewManager.current, (manager) => {
            manager.exitPictureInPicture();
          });
        },
        canEnterPictureInPicture: () => {
          return wrapNativeViewManagerFunction(
            nitroViewManager.current,
            (manager) => {
              return manager.canEnterPictureInPicture();
            }
          );
        },
        addEventListener: <Event extends keyof VideoViewEvents>(
          event: Event,
          callback: VideoViewEvents[Event]
        ): ListenerSubscription => {
          return wrapNativeViewManagerFunction(
            nitroViewManager.current,
            (manager) => {
              switch (event) {
                case 'onPictureInPictureChange':
                  return manager.addOnPictureInPictureChangeListener(
                    callback as VideoViewEvents['onPictureInPictureChange']
                  );
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
                case 'willEnterPictureInPicture':
                  return manager.addWillEnterPictureInPictureListener(
                    callback as VideoViewEvents['willEnterPictureInPicture']
                  );
                case 'willExitPictureInPicture':
                  return manager.addWillExitPictureInPictureListener(
                    callback as VideoViewEvents['willExitPictureInPicture']
                  );
                default:
                  throw new Error(
                    `[React Native Video] Unsupported event: ${event}`
                  );
              }
            }
          );
        },
      }),
      [player]
    );

    // Cleanup all listeners on unmount
    React.useEffect(() => {
      return () => {
        if (nitroViewManager.current) {
          nitroViewManager.current.clearAllListeners();
          setIsManagerReady(false);
        }
      };
    }, []);

    // Register prop-based event callbacks as listeners
    React.useEffect(() => {
      if (!nitroViewManager.current) {
        return;
      }

      const subscriptions: ListenerSubscription[] = [];

      if (onPictureInPictureChange) {
        subscriptions.push(
          nitroViewManager.current.addOnPictureInPictureChangeListener(
            onPictureInPictureChange
          )
        );
      }
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
      if (willEnterPictureInPicture) {
        subscriptions.push(
          nitroViewManager.current.addWillEnterPictureInPictureListener(
            willEnterPictureInPicture
          )
        );
      }
      if (willExitPictureInPicture) {
        subscriptions.push(
          nitroViewManager.current.addWillExitPictureInPictureListener(
            willExitPictureInPicture
          )
        );
      }

      return () => {
        subscriptions.forEach((sub) => sub.remove());
      };
    }, [
      onPictureInPictureChange,
      onFullscreenChange,
      willEnterFullscreen,
      willExitFullscreen,
      willEnterPictureInPicture,
      willExitPictureInPicture,
      isManagerReady,
    ]);

    // Update non-event props
    React.useEffect(() => {
      if (!nitroViewManager.current) {
        return;
      }

      updateNativeProps(nitroViewManager.current, player, {
        ...props,
        controls,
        pictureInPicture,
        autoEnterPictureInPicture,
        resizeMode,
      });
    }, [
      player,
      controls,
      pictureInPicture,
      autoEnterPictureInPicture,
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
