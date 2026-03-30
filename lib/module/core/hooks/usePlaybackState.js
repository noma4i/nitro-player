"use strict";

import { useEffect, useState } from 'react';
import { NitroPlayerRuntimeError } from "../types/NitroPlayerError.js";
const getPlaybackStateSafe = player => {
  if (!player) {
    return null;
  }
  try {
    return player.playbackState;
  } catch (error) {
    if (error instanceof NitroPlayerRuntimeError && error.code === 'player/released') {
      return null;
    }
    throw error;
  }
};
export const usePlaybackState = player => {
  const [state, setState] = useState(() => getPlaybackStateSafe(player));
  useEffect(() => {
    if (!player) {
      setState(null);
      return;
    }
    const initialState = getPlaybackStateSafe(player);
    setState(initialState);
    if (initialState === null) {
      return;
    }
    const subscription = player.addEventListener('onPlaybackState', next => {
      setState(next);
    });
    return () => {
      subscription.remove();
    };
  }, [player]);
  return state;
};
//# sourceMappingURL=usePlaybackState.js.map