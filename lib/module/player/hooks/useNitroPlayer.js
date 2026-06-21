"use strict";

import { useEffect, useRef } from 'react';
import { NitroPlayer } from "../NitroPlayer.js";
import { useManagedInstance } from "../../support/useManagedInstance.js";
import { prepareSource } from "../../source/prepareSource.js";

/**
 * Creates a `NitroPlayer` instance and manages its lifecycle.
 * @param source - The source of the video to play
 * @returns The `NitroPlayer` instance
 */
export const useNitroPlayer = source => {
  const preparedSource = prepareSource(source);
  const player = useManagedInstance({
    factory: () => {
      return new NitroPlayer(preparedSource);
    },
    cleanup: player => {
      player.__destroy();
    }
  }, []);
  const previousSourceRef = useRef(preparedSource);
  const replaceQueueRef = useRef(Promise.resolve());
  const sourceUpdateIdRef = useRef(0);
  useEffect(() => {
    if (previousSourceRef.current.identity.playbackKey === preparedSource.identity.playbackKey) {
      return;
    }
    previousSourceRef.current = preparedSource;
    const updateId = ++sourceUpdateIdRef.current;
    let isActive = true;
    replaceQueueRef.current = replaceQueueRef.current.catch(() => undefined).then(() => {
      if (!isActive) {
        return;
      }
      return player.replaceSourceAsync(preparedSource);
    }).catch(error => {
      if (isActive && sourceUpdateIdRef.current === updateId) {
        console.error('[NitroPlay] Failed to replace source from React update', error);
      }
    });
    return () => {
      isActive = false;
    };
  }, [player, preparedSource]);
  return player;
};
//# sourceMappingURL=useNitroPlayer.js.map