import { useLayoutEffect, useRef, useState } from 'react';
import type { NitroPlayerSource } from '../../bridge/nitro/NitroPlayerSource.nitro';
import { prepareSource } from '../../source/prepareSource';
import type { NitroSourceInput } from '../../source/types/NitroPlayerConfig';
import { NitroPlayer } from '../NitroPlayer';

/**
 * Creates a `NitroPlayer` instance and manages its lifecycle.
 * @param source - The source of the video to play
 * @returns The `NitroPlayer` instance
 */
export const useNitroPlayer = (source: NitroSourceInput | NitroPlayerSource): NitroPlayer => {
  const preparedSource = prepareSource(source);
  const [player] = useState(() => new NitroPlayer(preparedSource));

  const preparedSourceRef = useRef(preparedSource);
  preparedSourceRef.current = preparedSource;

  const previousPlaybackKeyRef = useRef(preparedSource.identity.playbackKey);
  const sourceUpdateIdRef = useRef(0);

  useLayoutEffect(() => {
    player.__createNativePlayer(preparedSourceRef.current);
    previousPlaybackKeyRef.current = preparedSourceRef.current.identity.playbackKey;
    return () => player.__destroy();
  }, [player]);

  useLayoutEffect(() => {
    if (previousPlaybackKeyRef.current === preparedSource.identity.playbackKey) {
      return;
    }

    previousPlaybackKeyRef.current = preparedSource.identity.playbackKey;

    const updateId = ++sourceUpdateIdRef.current;
    const source = preparedSourceRef.current;
    let isActive = true;
    void player.replaceSourceAsync(source)
      .catch(error => {
        if (isActive && sourceUpdateIdRef.current === updateId) {
          console.error('[NitroPlay] Failed to replace source from React update', error);
        }
      });

    return () => {
      isActive = false;
    };
  }, [player, preparedSource.identity.playbackKey]);

  return player;
};
