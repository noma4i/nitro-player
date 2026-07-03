import React from 'react';
import { type NitroPlayerViewProps } from '../view/NitroPlayerView';
import type { ResizeMode } from '../view/types/ResizeMode';
import type { SurfaceType } from '../bridge/nitro/NitroPlayerViewManager.nitro';
import type { NitroFeedRingPlayer, NitroFeedRingSlotId } from './NitroFeedRingPlayer';
export interface NitroFeedRingSlotViewProps extends Omit<NitroPlayerViewProps, 'player' | 'source' | 'controls' | 'keepScreenAwake' | 'resizeMode' | 'surfaceType'> {
    ring: NitroFeedRingPlayer;
    slotId: NitroFeedRingSlotId;
    revision?: number;
    resizeMode?: ResizeMode;
    surfaceType?: SurfaceType;
}
declare const _default: React.MemoExoticComponent<({ ring, slotId, resizeMode, surfaceType, ...viewProps }: NitroFeedRingSlotViewProps) => import("react/jsx-runtime").JSX.Element | null>;
export default _default;
//# sourceMappingURL=NitroFeedRingSlotView.d.ts.map