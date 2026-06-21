import * as React from 'react';
import type { ViewProps, ViewStyle } from 'react-native';
import type { ListenerSubscription } from '../bridge/nitro/NitroPlayerEventEmitter.nitro';
import type { SurfaceType } from '../bridge/nitro/NitroPlayerViewManager.nitro';
import { type NitroPlayerViewEvents } from './events';
import type { ResizeMode } from './types/ResizeMode';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig';
import type { NitroPlayerDefaults } from '../player/types/NitroPlayerDefaults';
import { NitroPlayer } from '../player/NitroPlayer';
export interface NitroPlayerViewProps extends Partial<NitroPlayerViewEvents>, ViewProps {
    source: NitroSourceInput;
    playerDefaults?: NitroPlayerDefaults;
    style?: ViewStyle;
    controls?: boolean;
    resizeMode?: ResizeMode;
    keepScreenAwake?: boolean;
    surfaceType?: SurfaceType;
}
export interface NitroPlayerViewRef {
    player: NitroPlayer;
    isAttached: boolean;
    enterFullscreen: () => void;
    exitFullscreen: () => void;
    addEventListener: <Event extends keyof NitroPlayerViewEvents>(event: Event, callback: NitroPlayerViewEvents[Event]) => ListenerSubscription;
}
declare const _default: React.NamedExoticComponent<NitroPlayerViewProps & React.RefAttributes<NitroPlayerViewRef>>;
export default _default;
export declare const NitroVideo: React.NamedExoticComponent<NitroPlayerViewProps & React.RefAttributes<NitroPlayerViewRef>>;
//# sourceMappingURL=NitroPlayerView.d.ts.map