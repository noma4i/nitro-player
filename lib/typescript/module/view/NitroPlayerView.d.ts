import * as React from 'react';
import type { ViewProps, ViewStyle } from 'react-native';
import type { ListenerSubscription } from '../bridge/nitro/NitroPlayerEventEmitter.nitro.js';
import type { SurfaceType } from '../bridge/nitro/NitroPlayerViewManager.nitro.js';
import { NitroPlayer } from '../player/NitroPlayer.js';
import type { NitroPlayerDefaults } from '../player/types/NitroPlayerDefaults.js';
import { type NitroPlayerViewEvents } from './events.js';
import type { ResizeMode } from './types/ResizeMode.js';
export interface NitroPlayerViewBaseProps extends Partial<NitroPlayerViewEvents>, ViewProps {
    playerDefaults?: NitroPlayerDefaults;
    style?: ViewStyle;
    controls?: boolean;
    resizeMode?: ResizeMode;
    keepScreenAwake?: boolean;
    surfaceType?: SurfaceType;
}
export type NitroPlayerViewProps = NitroPlayerViewBaseProps & {
    player: NitroPlayer;
};
export interface NitroPlayerViewRef {
    player: NitroPlayer;
    isAttached: boolean;
    enterFullscreen: () => void;
    exitFullscreen: () => void;
    addEventListener: <Event extends keyof NitroPlayerViewEvents>(event: Event, callback: NitroPlayerViewEvents[Event]) => ListenerSubscription;
}
declare const _default: React.NamedExoticComponent<NitroPlayerViewBaseProps & {
    player: NitroPlayer;
} & React.RefAttributes<NitroPlayerViewRef>>;
export default _default;
//# sourceMappingURL=NitroPlayerView.d.ts.map