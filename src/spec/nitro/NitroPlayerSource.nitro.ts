import type { HybridObject } from 'react-native-nitro-modules';
import type { NativeNitroPlayerConfig } from '../../core/types/NitroPlayerConfig';
import type { NitroPlayerSourceBase } from '../../core/types/NitroPlayerSourceBase';

/**
 * A source for a {@link NitroPlayer}.
 * Source cannot be changed after it is created. If you need to update the source, you need to create a new one.
 * It provides functions to get information about the asset.
 */
export interface NitroPlayerSource
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }>,
    NitroPlayerSourceBase {}

export interface NitroPlayerSourceFactory
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  fromUri(uri: string): NitroPlayerSource;
  fromNitroPlayerConfig(config: NativeNitroPlayerConfig): NitroPlayerSource;
}
