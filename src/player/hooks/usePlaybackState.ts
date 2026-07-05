import { useEffect, useRef, useState } from 'react';
import { NitroPlayer } from '../NitroPlayer';
import type { PlaybackState } from '../types/PlaybackState';
import { NitroPlayerRuntimeError } from '../../support/errors/NitroPlayerError';

export type PlaybackStateSelector<Selected> = (state: PlaybackState) => Selected;

const shallowEqual = (previous: unknown, next: unknown): boolean => {
  if (Object.is(previous, next)) {
    return true;
  }
  if (typeof previous !== 'object' || previous === null || typeof next !== 'object' || next === null) {
    return false;
  }
  if (Array.isArray(previous) !== Array.isArray(next)) {
    return false;
  }
  if (Array.isArray(previous) && Array.isArray(next) && previous.length !== next.length) {
    return false;
  }

  const previousRecord = previous as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const previousKeys = Object.keys(previousRecord);
  const nextKeys = Object.keys(nextRecord);
  return previousKeys.length === nextKeys.length && previousKeys.every(key => Object.is(previousRecord[key], nextRecord[key]));
};

const selectedValuesEqual = (previous: unknown, next: unknown, shallowCompare: boolean): boolean => {
  if (Object.is(previous, next)) {
    return true;
  }
  return shallowCompare && shallowEqual(previous, next);
};

const selectPlaybackState = <Selected>(state: PlaybackState, selector?: PlaybackStateSelector<Selected>): PlaybackState | Selected => (selector ? selector(state) : state);

const getPlaybackStateSafe = (player: NitroPlayer | null | undefined): PlaybackState | null => {
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

export function usePlaybackState(player: NitroPlayer | null | undefined): PlaybackState | null;
export function usePlaybackState<Selected>(player: NitroPlayer | null | undefined, selector: PlaybackStateSelector<Selected>): Selected | null;
export function usePlaybackState<Selected>(player: NitroPlayer | null | undefined, selector?: PlaybackStateSelector<Selected>): PlaybackState | Selected | null {
  const selectorRef = useRef(selector);
  const hasSelectorRef = useRef(selector !== undefined);
  selectorRef.current = selector;
  hasSelectorRef.current = selector !== undefined;

  const [state, setState] = useState<PlaybackState | Selected | null>(() => {
    const rawState = getPlaybackStateSafe(player);
    return rawState ? selectPlaybackState(rawState, selectorRef.current) : null;
  });

  useEffect(() => {
    if (!player) {
      setState(null);
      return;
    }

    const rawInitialState = getPlaybackStateSafe(player);
    const initialState = rawInitialState ? selectPlaybackState(rawInitialState, selectorRef.current) : null;
    setState(previous => (selectedValuesEqual(previous, initialState, hasSelectorRef.current) ? previous : initialState));

    if (rawInitialState === null) {
      return;
    }

    const subscription = player.addEventListener('onPlaybackState', next => {
      const selected = selectPlaybackState(next, selectorRef.current);
      setState(previous => (selectedValuesEqual(previous, selected, hasSelectorRef.current) ? previous : selected));
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  return state;
}
