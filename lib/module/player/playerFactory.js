"use strict";

import { NitroModules } from 'react-native-nitro-modules';
import { createNativeNitroSource, isNitroPlayerSource } from "../source/sourceFactory.js";
import { tryParseNativeNitroPlayerError } from "../support/errors/NitroPlayerError.js";
const nitroPlayerFactory = NitroModules.createHybridObject('NitroPlayerFactory');
/**
 * @internal
 * Creates a Native NitroPlayer instance.
 *
 * @param source - The source of the video to play
 * @returns The Native NitroPlayer instance
 */
export const createPlayer = source => {
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
//# sourceMappingURL=playerFactory.js.map