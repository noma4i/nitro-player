import { NitroModules } from 'react-native-nitro-modules';
import type { NitroPlayer, NitroPlayerFactory } from '../bridge/nitro/NitroPlayer.nitro';
import type { NitroPlayerSource } from '../bridge/nitro/NitroPlayerSource.nitro';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig';
import { createNativeNitroSource, isNitroPlayerSource } from '../source/sourceFactory';
import { tryParseNativeNitroPlayerError } from '../support/errors/NitroPlayerError';

const NitroPlayerFactory = NitroModules.createHybridObject<NitroPlayerFactory>('NitroPlayerFactory');

export interface CreatedNitroPlayer {
  player: NitroPlayer;
  source: NitroPlayerSource;
}

/**
 * @internal
 * Creates a Native NitroPlayer instance.
 *
 * @param source - The source of the video to play
 * @returns The Native NitroPlayer instance
 */
export const createPlayer = (source: NitroSourceInput | NitroPlayerSource): CreatedNitroPlayer => {
  try {
    const nativeSource = isNitroPlayerSource(source) ? source : createNativeNitroSource(source);

    return {
      player: NitroPlayerFactory.createPlayer(nativeSource),
      source: nativeSource
    };
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};
