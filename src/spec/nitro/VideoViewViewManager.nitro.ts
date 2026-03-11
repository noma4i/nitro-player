import type { HybridObject } from 'react-native-nitro-modules';
import type { ResizeMode } from '../../core/types/ResizeMode';
import type { VideoPlayer } from './VideoPlayer.nitro';
import type { ListenerSubscription } from './VideoPlayerEventEmitter.nitro';

export type SurfaceType = 'surface' | 'texture';

// @internal
export interface VideoViewViewManager
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  player?: VideoPlayer;
  controls: boolean;
  resizeMode: ResizeMode;
  enterFullscreen(): void;
  exitFullscreen(): void;
  keepScreenAwake: boolean;
  surfaceType: SurfaceType;

  addOnFullscreenChangeListener(
    listener: (fullscreen: boolean) => void
  ): ListenerSubscription;

  addWillEnterFullscreenListener(listener: () => void): ListenerSubscription;

  addWillExitFullscreenListener(listener: () => void): ListenerSubscription;

  clearAllListeners(): void;
}

// @internal
export interface VideoViewViewManagerFactory
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  createViewManager(nitroId: number): VideoViewViewManager;
}
