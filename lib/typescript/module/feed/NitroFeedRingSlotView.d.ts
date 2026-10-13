import React from 'react';
import type { SurfaceType } from '../bridge/nitro/NitroPlayerViewManager.nitro.js';
import { type NitroPlayerViewProps } from '../view/NitroPlayerView.js';
import type { ResizeMode } from '../view/types/ResizeMode.js';
import type { NitroFeedRingPlayer, NitroFeedRingSlotId } from './NitroFeedRingPlayer.js';
export interface NitroFeedRingSlotViewProps extends Omit<NitroPlayerViewProps, 'player' | 'controls' | 'keepScreenAwake' | 'resizeMode' | 'surfaceType'> {
    ring: NitroFeedRingPlayer;
    slotId: NitroFeedRingSlotId;
    revision?: number;
    resizeMode?: ResizeMode;
    surfaceType?: SurfaceType;
}
declare const _default: React.MemoExoticComponent<({ ring, slotId, resizeMode, surfaceType, ...viewProps }: NitroFeedRingSlotViewProps) => import("react/jsx-runtime").JSX.Element | null>;
export default _default;
//# sourceMappingURL=NitroFeedRingSlotView.d.ts.map