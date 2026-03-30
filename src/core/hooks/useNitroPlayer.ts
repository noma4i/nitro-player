import { useEffect, useRef } from 'react';
import type { NitroPlayerSource } from '../../spec/nitro/NitroPlayerSource.nitro';
import type { NitroSourceConfig } from '../types/NitroPlayerConfig';
import { NitroPlayer } from '../NitroPlayer';
import { useManagedInstance } from './useManagedInstance';

/**
 * Creates a `NitroPlayer` instance and manages its lifecycle.
 * @param source - The source of the video to play
 * @returns The `NitroPlayer` instance
 */
export const useNitroPlayer = (
  source: NitroSourceConfig | NitroPlayerSource
) => {
  const player = useManagedInstance(
    {
      factory: () => {
        return new NitroPlayer(source);
      },
      cleanup: player => {
        player.__destroy();
      }
    },
    []
  );

  const previousSourceRef = useRef(source);
  const replaceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sourceUpdateIdRef = useRef(0);

  useEffect(() => {
    if (previousSourceRef.current === source) {
      return;
    }

    previousSourceRef.current = source;

    const updateId = ++sourceUpdateIdRef.current;
    let isActive = true;
    replaceQueueRef.current = replaceQueueRef.current
      .catch(() => undefined)
      .then(() => {
        if (!isActive) {
          return;
        }

        return player.replaceSourceAsync(source);
      })
      .catch(error => {
        if (isActive && sourceUpdateIdRef.current === updateId) {
          console.error('[NitroPlay] Failed to replace source from React update', error);
        }
      });

    return () => {
      isActive = false;
    };
  }, [player, source]);

  return player;
};
