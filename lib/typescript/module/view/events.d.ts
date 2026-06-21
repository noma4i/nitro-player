import type { NitroPlayer } from '../player/NitroPlayer';
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
export declare const ALL_VIEW_EVENTS: (keyof NitroPlayerViewEvents)[];
//# sourceMappingURL=events.d.ts.map