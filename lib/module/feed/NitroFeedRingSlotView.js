"use strict";

import React from 'react';
import NitroPlayerView from "../view/NitroPlayerView.js";
import { jsx as _jsx } from "react/jsx-runtime";
const NitroFeedRingSlotView = ({
  ring,
  slotId,
  resizeMode = 'cover',
  surfaceType,
  ...viewProps
}) => {
  const player = ring.getSlotPlayer(slotId);
  if (!player) {
    return null;
  }
  return /*#__PURE__*/_jsx(NitroPlayerView, {
    player: player,
    controls: false,
    keepScreenAwake: false,
    resizeMode: resizeMode,
    surfaceType: surfaceType,
    ...viewProps
  });
};
export default /*#__PURE__*/React.memo(NitroFeedRingSlotView);
//# sourceMappingURL=NitroFeedRingSlotView.js.map