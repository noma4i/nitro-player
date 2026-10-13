import * as React from 'react';
import type { onLoadData } from '../player/events';
import type { PlaybackState } from '../player/types/PlaybackState';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig';
import type { PlaybackError } from '../support/errors/PlaybackError';
import { type NitroPlayerViewBaseProps } from '../view/NitroPlayerView';
import type { NitroPlaybackPolicy } from './NitroPlaybackPolicy';
import { type NitroPlaybackSurfaceSnapshot } from './NitroPlaybackSurfaceSnapshot';
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