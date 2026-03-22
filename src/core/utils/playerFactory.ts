import { NitroModules } from 'react-native-nitro-modules';
import type {
  NitroPlayer,
  NitroPlayerFactory,
} from '../../spec/nitro/NitroPlayer.nitro';
import type { NitroPlayerSource } from '../../spec/nitro/NitroPlayerSource.nitro';
import type { NitroPlayerConfig, NitroPlayerSource as NitroPlayerSourceType } from '../types/NitroPlayerConfig';
import { createSource, isNitroPlayerSource } from './sourceFactory';
import { tryParseNativeNitroPlayerError } from '../types/NitroPlayerError';

const NitroPlayerFactory =
  NitroModules.createHybridObject<NitroPlayerFactory>('NitroPlayerFactory');

/**
 * @internal
 * Creates a Native NitroPlayer instance.
 *
 * @param source - The source of the video to play
 * @returns The Native NitroPlayer instance
 */
export const createPlayer = (
  source: NitroPlayerSourceType | NitroPlayerConfig | NitroPlayerSource
): NitroPlayer => {
  try {
    if (isNitroPlayerSource(source)) {
      return NitroPlayerFactory.createPlayer(source);
    }

    return NitroPlayerFactory.createPlayer(createSource(source));
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};
