"use strict";

import { useEffect, useRef, useState } from 'react';
import { NitroPlayerRuntimeError } from "../../support/errors/NitroPlayerError.js";
const shallowEqual = (previous, next) => {
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
  const previousRecord = previous;
  const nextRecord = next;
  const previousKeys = Object.keys(previousRecord);
  const nextKeys = Object.keys(nextRecord);
  return previousKeys.length === nextKeys.length && previousKeys.every(key => Object.is(previousRecord[key], nextRecord[key]));
};
const selectedValuesEqual = (previous, next, shallowCompare) => {
  if (Object.is(previous, next)) {
    return true;
  }
  return shallowCompare && shallowEqual(previous, next);
};
const selectPlaybackState = (state, selector) => selector ? selector(state) : state;
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
export function usePlaybackState(player, selector) {
  const selectorRef = useRef(selector);
  const hasSelectorRef = useRef(selector !== undefined);
  selectorRef.current = selector;
  hasSelectorRef.current = selector !== undefined;
  const [state, setState] = useState(() => {
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
    setState(previous => selectedValuesEqual(previous, initialState, hasSelectorRef.current) ? previous : initialState);
    if (rawInitialState === null) {
      return;
    }
    const subscription = player.addEventListener('onPlaybackState', next => {
      const selected = selectPlaybackState(next, selectorRef.current);
      setState(previous => selectedValuesEqual(previous, selected, hasSelectorRef.current) ? previous : selected);
    });
    return () => {
      subscription.remove();
    };
  }, [player]);
  return state;
}
//# sourceMappingURL=usePlaybackState.js.map