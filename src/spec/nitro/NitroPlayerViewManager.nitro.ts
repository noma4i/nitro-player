import type { HybridObject } from 'react-native-nitro-modules';
import type { ResizeMode } from '../../core/types/ResizeMode';
import type { NitroPlayer } from './NitroPlayer.nitro';
import type { ListenerSubscription } from './NitroPlayerEventEmitter.nitro';
import type { NitroPlayerDefaults } from '../../core/types/NitroPlayerDefaults';

export type SurfaceType = 'surface' | 'texture';

// @internal
export interface NitroPlayerViewManager
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  player?: NitroPlayer;
  isAttached: boolean;
  controls: boolean;
  resizeMode: ResizeMode;
  enterFullscreen(): void;
  exitFullscreen(): void;
  keepScreenAwake: boolean;
  surfaceType: SurfaceType;
  setPlayerDefaults(defaults: NitroPlayerDefaults): void;
  clearPlayerDefaults(): void;

  addOnAttachedListener(listener: () => void): ListenerSubscription;

  addOnDetachedListener(listener: () => void): ListenerSubscription;

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
