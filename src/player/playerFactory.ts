import { NitroModules } from 'react-native-nitro-modules';
import type { NitroPlayer, NitroPlayerFactory as NitroPlayerFactoryModule } from '../bridge/nitro/NitroPlayer.nitro';
import type { NitroPlayerSource } from '../bridge/nitro/NitroPlayerSource.nitro';
import { createNativeNitroSource, isNitroPlayerSource } from '../source/sourceFactory';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig';
import { tryParseNativeNitroPlayerError } from '../support/errors/NitroPlayerError';

const nitroPlayerFactory = NitroModules.createHybridObject<NitroPlayerFactoryModule>('NitroPlayerFactory');

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
      player: nitroPlayerFactory.createPlayer(nativeSource),
      source: nativeSource
    };
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};
