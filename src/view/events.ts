import type { NitroPlayer } from '../player/NitroPlayer';
import { allKeysOf } from '../support/typeHelpers';

export interface NitroPlayerViewEvents {
  /**
   * Called when the native video view becomes attached.
   */
  onAttached: (player: NitroPlayer) => void;
  /**
   * Called when the native video view detaches from the window hierarchy.
   */
  onDetached: () => void;
  /**
   * Called when the video view's fullscreen state changes.
   * @param fullscreen Whether the video view is in fullscreen mode.
   */
  onFullscreenChange: (fullscreen: boolean) => void;
  /**
   * Called when the video view will enter fullscreen mode.
   */
  willEnterFullscreen: () => void;
  /**
   * Called when the video view will exit fullscreen mode.
   */
  willExitFullscreen: () => void;
}

export const ALL_VIEW_EVENTS: (keyof NitroPlayerViewEvents)[] =
  allKeysOf<NitroPlayerViewEvents>()(
    'onAttached',
    'onDetached',
    'onFullscreenChange',
    'willEnterFullscreen',
    'willExitFullscreen'
  );
