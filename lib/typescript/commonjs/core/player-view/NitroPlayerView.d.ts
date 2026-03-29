import * as React from 'react';
import type { ViewProps, ViewStyle } from 'react-native';
import type { ListenerSubscription } from '../../spec/nitro/NitroPlayerEventEmitter.nitro';
import type { SurfaceType } from '../../spec/nitro/NitroPlayerViewManager.nitro';
import { type NitroPlayerViewEvents } from '../types/Events';
import type { ResizeMode } from '../types/ResizeMode';
import type { NitroSourceConfig } from '../types/NitroPlayerConfig';
import type { NitroPlayerDefaults } from '../types/NitroPlayerDefaults';
import { NitroPlayer } from '../NitroPlayer';
export interface NitroPlayerViewProps extends Partial<NitroPlayerViewEvents>, ViewProps {
    source: NitroSourceConfig;
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
//# sourceMappingURL=NitroPlayerView.d.ts.map