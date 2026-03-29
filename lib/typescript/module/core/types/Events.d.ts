import type { PlaybackState } from './PlaybackState';
import type { NitroPlayerSource } from '../../spec/nitro/NitroPlayerSource.nitro';
import type { NitroPlayerOrientation } from './NitroPlayerOrientation';
import type { NitroPlayer } from '../NitroPlayer';
export interface NitroPlayerEvents {
    /**
     * Called when the bandwidth of the video changes.
     */
    onBandwidthUpdate: (data: BandwidthData) => void;
    /**
     * Called when the video is loaded.
     * @note onLoadStart -> initialize the player -> onLoad
     */
    onLoad: (data: onLoadData) => void;
    /**
     * Called when the video starts loading.
     * @note onLoadStart -> initialize the player -> onLoad
     */
    onLoadStart: (data: onLoadStartData) => void;
    /**
     * Called when the player playback snapshot changes.
     */
    onPlaybackState: (state: PlaybackState) => void;
    /**
     * Called when the volume of the player changes.
     */
    onVolumeChange: (data: onVolumeChangeData) => void;
}
export type AllNitroPlayerEvents = NitroPlayerEvents;
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
export interface BandwidthData {
    /**
     * The bitrate of the video in bits per second.
     */
    bitrate: number;
    /**
     * The width of the video in pixels.
     * @platform android
     */
    width?: number;
    /**
     * The height of the video in pixels.
     * @platform Android
     */
    height?: number;
}
export interface onLoadData {
    currentTime: number;
    duration: number;
    height: number;
    width: number;
    orientation: NitroPlayerOrientation;
}
export type SourceType = 'local' | 'network';
export interface onLoadStartData {
    sourceType: SourceType;
    source: NitroPlayerSource;
}
export interface onVolumeChangeData {
    volume: number;
    muted: boolean;
}
export declare const ALL_PLAYER_EVENTS: (keyof AllNitroPlayerEvents)[];
export declare const ALL_VIEW_EVENTS: (keyof NitroPlayerViewEvents)[];
//# sourceMappingURL=Events.d.ts.map