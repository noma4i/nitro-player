import * as React from 'react';
import type { onLoadData } from '../player/events.js';
import type { PlaybackState } from '../player/types/PlaybackState.js';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig.js';
import type { PlaybackError } from '../support/errors/PlaybackError.js';
import { type NitroPlayerViewBaseProps } from '../view/NitroPlayerView.js';
import type { NitroPlaybackPolicy } from './NitroPlaybackPolicy.js';
import { type NitroPlaybackSurfaceSnapshot } from './NitroPlaybackSurfaceSnapshot.js';
export interface NitroPlaybackSurfaceProps extends Omit<NitroPlayerViewBaseProps, 'onAttached' | 'onDetached'> {
    source: NitroSourceInput;
    playbackKey: string;
    context: NitroPlaybackPolicy;
    shouldPlay: boolean;
    active: boolean;
    visible: boolean;
    muted: boolean;
    loop: boolean;
    rate?: number;
    onAttached?: () => void;
    onDetached?: () => void;
    onSnapshotChange?: (snapshot: NitroPlaybackSurfaceSnapshot) => void;
    onProgress?: (state: PlaybackState) => void;
    onLoad?: (data: onLoadData) => void;
    onError?: (error: PlaybackError) => void;
    onEnd?: () => void;
    onPlaybackIntentIdled?: () => void;
}
export interface NitroPlaybackSurfaceRef {
    seekTo(time: number): void;
    replay(): void;
    enterFullscreen(): void;
    exitFullscreen(): void;
}
export declare const NitroPlaybackSurface: React.NamedExoticComponent<NitroPlaybackSurfaceProps & React.RefAttributes<NitroPlaybackSurfaceRef>>;
//# sourceMappingURL=NitroPlaybackSurface.d.ts.map