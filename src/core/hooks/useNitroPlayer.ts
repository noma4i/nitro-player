import { useEffect, useRef } from 'react';
import type { NitroPlayerSource } from '../../spec/nitro/NitroPlayerSource.nitro';
import type { NitroSourceConfig } from '../types/NitroPlayerConfig';
import type { NitroPlayerDefaults } from '../types/NitroPlayerDefaults';
import { NitroPlayer } from '../NitroPlayer';
import { useManagedInstance } from './useManagedInstance';
import { getSourceIdentityKey } from '../utils/sourceFactory';

/**
 * Creates a `NitroPlayer` instance and manages its lifecycle.
 * @param source - The source of the video to play
 * @param defaults - Declarative defaults that are applied to the player instance
 * @returns The `NitroPlayer` instance
 */
export const useNitroPlayer = (
  source: NitroSourceConfig | NitroPlayerSource,
  defaults?: NitroPlayerDefaults
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
    [getSourceIdentityKey(source)]
  );

  const appliedDefaultsRef = useRef<{
    player: NitroPlayer | null;
    defaults?: NitroPlayerDefaults | undefined;
  }>({
    player: null,
    defaults: undefined
  });

  useEffect(() => {
    if (defaults === undefined) {
      appliedDefaultsRef.current = { player, defaults: undefined };
      return;
    }

    if (appliedDefaultsRef.current.player === player && appliedDefaultsRef.current.defaults === defaults) {
      return;
    }

    if (defaults.loop !== undefined) {
      player.loop = defaults.loop;
    }
    if (defaults.muted !== undefined) {
      player.muted = defaults.muted;
    }
    if (defaults.volume !== undefined) {
      player.volume = defaults.volume;
    }
    if (defaults.rate !== undefined) {
      player.rate = defaults.rate;
    }
    if (defaults.mixAudioMode !== undefined) {
      player.mixAudioMode = defaults.mixAudioMode;
    }
    if (defaults.ignoreSilentSwitchMode !== undefined) {
      player.ignoreSilentSwitchMode = defaults.ignoreSilentSwitchMode;
    }
    if (defaults.playInBackground !== undefined) {
      player.playInBackground = defaults.playInBackground;
    }
    if (defaults.playWhenInactive !== undefined) {
      player.playWhenInactive = defaults.playWhenInactive;
    }

    appliedDefaultsRef.current = { player, defaults };
  }, [defaults, player]);

  return player;
};
