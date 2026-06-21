import { NitroModules } from 'react-native-nitro-modules';
import type { NitroPlayerSource, NitroPlayerSourceFactory } from '../bridge/nitro/NitroPlayerSource.nitro';
import type { NitroSourceInput } from './types/NitroPlayerConfig';
import { tryParseNativeNitroPlayerError } from '../support/errors/NitroPlayerError';
import { toNativeSourceConfig } from './prepareSource';

const NitroPlayerSourceFactory = NitroModules.createHybridObject<NitroPlayerSourceFactory>('NitroPlayerSourceFactory');

export const isNitroPlayerSource = (obj: unknown): obj is NitroPlayerSource => {
  return obj != null && typeof obj === 'object' && 'name' in obj && (obj as { name: unknown }).name === 'NitroPlayerSource';
};

export const createNativeNitroSource = (source: NitroSourceInput) => {
  const normalizedConfig = toNativeSourceConfig(source);
  try {
    return NitroPlayerSourceFactory.fromNitroPlayerConfig(normalizedConfig);
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};
