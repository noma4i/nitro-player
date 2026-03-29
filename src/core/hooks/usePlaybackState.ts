import { useEffect, useState } from 'react';
import { NitroPlayer } from '../NitroPlayer';
import type { PlaybackState } from '../types/PlaybackState';
import { NitroPlayerRuntimeError } from '../types/NitroPlayerError';

const getPlaybackStateSafe = (player: NitroPlayer | null | undefined) => {
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

export const usePlaybackState = (player: NitroPlayer | null | undefined) => {
  const [state, setState] = useState<PlaybackState | null>(() => getPlaybackStateSafe(player));

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
