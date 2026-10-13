import React from 'react';
import type { SurfaceType } from '../bridge/nitro/NitroPlayerViewManager.nitro';
import NitroPlayerView, { type NitroPlayerViewProps } from '../view/NitroPlayerView';
import type { ResizeMode } from '../view/types/ResizeMode';
import type { NitroFeedRingPlayer, NitroFeedRingSlotId } from './NitroFeedRingPlayer';

export interface NitroFeedRingSlotViewProps extends Omit<NitroPlayerViewProps, 'player' | 'controls' | 'keepScreenAwake' | 'resizeMode' | 'surfaceType'> {
  ring: NitroFeedRingPlayer;
  slotId: NitroFeedRingSlotId;
  revision?: number;
  resizeMode?: ResizeMode;
  surfaceType?: SurfaceType;
}

const NitroFeedRingSlotView = ({ ring, slotId, resizeMode = 'cover', surfaceType, ...viewProps }: NitroFeedRingSlotViewProps) => {
  const player = ring.getSlotPlayer(slotId);
  if (!player) {
    return null;
  }

  return (
    <NitroPlayerView
      player={player}
      controls={false}
      keepScreenAwake={false}
      resizeMode={resizeMode}
      surfaceType={surfaceType}
      {...viewProps}
    />
  );
};

export default React.memo(NitroFeedRingSlotView);
