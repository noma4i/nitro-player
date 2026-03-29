"use strict";

import { NitroModules } from 'react-native-nitro-modules';
import { createSource, isNitroPlayerSource } from "./sourceFactory.js";
import { tryParseNativeNitroPlayerError } from "../types/NitroPlayerError.js";
const NitroPlayerFactory = NitroModules.createHybridObject('NitroPlayerFactory');

/**
 * @internal
 * Creates a Native NitroPlayer instance.
 *
 * @param source - The source of the video to play
 * @returns The Native NitroPlayer instance
 */
export const createPlayer = source => {
  try {
    if (isNitroPlayerSource(source)) {
      return NitroPlayerFactory.createPlayer(source);
    }
    return NitroPlayerFactory.createPlayer(createSource(source));
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};
//# sourceMappingURL=playerFactory.js.map