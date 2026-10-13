import { NitroModules } from 'react-native-nitro-modules';
import type { NitroPlayerSource, NitroPlayerSourceFactory as NitroPlayerSourceFactoryModule } from '../bridge/nitro/NitroPlayerSource.nitro';
import { tryParseNativeNitroPlayerError } from '../support/errors/NitroPlayerError';
import { toNativeSourceConfig } from './prepareSource';
import type { NitroSourceInput } from './types/NitroPlayerConfig';

const nitroPlayerSourceFactory = NitroModules.createHybridObject<NitroPlayerSourceFactoryModule>('NitroPlayerSourceFactory');

export const isNitroPlayerSource = (obj: unknown): obj is NitroPlayerSource => {
  return obj != null && typeof obj === 'object' && 'name' in obj && (obj as { name: unknown }).name === 'NitroPlayerSource';
};

export const createNativeNitroSource = (source: NitroSourceInput): NitroPlayerSource => {
  const normalizedConfig = toNativeSourceConfig(source);
  try {
    return nitroPlayerSourceFactory.fromNitroPlayerConfig(normalizedConfig);
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};
