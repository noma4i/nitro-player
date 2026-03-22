import type { HybridObject } from 'react-native-nitro-modules';
import type { ResizeMode } from '../../core/types/ResizeMode';
import type { NitroPlayer } from './NitroPlayer.nitro';
import type { ListenerSubscription } from './NitroPlayerEventEmitter.nitro';

export type SurfaceType = 'surface' | 'texture';

// @internal
export interface NitroPlayerViewManager
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  player?: NitroPlayer;
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
export interface NitroPlayerViewManagerFactory
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  createViewManager(nitroId: number): NitroPlayerViewManager;
}
