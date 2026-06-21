"use strict";

import { NitroModules } from 'react-native-nitro-modules';
import { tryParseNativeNitroPlayerError } from "../support/errors/NitroPlayerError.js";
import { toNativeSourceConfig } from "./prepareSource.js";
const NitroPlayerSourceFactory = NitroModules.createHybridObject('NitroPlayerSourceFactory');
export const isNitroPlayerSource = obj => {
  return obj != null && typeof obj === 'object' && 'name' in obj && obj.name === 'NitroPlayerSource';
};
export const createNativeNitroSource = source => {
  const normalizedConfig = toNativeSourceConfig(source);
  try {
    return NitroPlayerSourceFactory.fromNitroPlayerConfig(normalizedConfig);
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};
//# sourceMappingURL=sourceFactory.js.map