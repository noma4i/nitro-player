"use strict";

import { useEffect, useRef } from 'react';
import { NitroPlayer } from "../NitroPlayer.js";
import { useManagedInstance } from "./useManagedInstance.js";

/**
 * Creates a `NitroPlayer` instance and manages its lifecycle.
 * @param source - The source of the video to play
 * @returns The `NitroPlayer` instance
 */
export const useNitroPlayer = source => {
  const player = useManagedInstance({
    factory: () => {
      return new NitroPlayer(source);
    },
    cleanup: player => {
      player.__destroy();
    }
  }, []);
  const previousSourceRef = useRef(source);
  useEffect(() => {
    if (previousSourceRef.current === source) {
      return;
    }
    previousSourceRef.current = source;
    let isActive = true;
    const replacePromise = player.replaceSourceAsync(source);
    Promise.resolve(replacePromise).catch(error => {
      if (isActive) {
        console.error('[NitroPlay] Failed to replace source from React update', error);
      }
    });
    return () => {
      isActive = false;
    };
  }, [player, source]);
  return player;
};
//# sourceMappingURL=useNitroPlayer.js.map