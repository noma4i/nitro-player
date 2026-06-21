import type { NativeNitroPlayerConfig } from './NitroPlayerConfig';
import type { NitroPlayerInformation } from '../../player/types/NitroPlayerInformation';

export interface NitroPlayerSourceBase {
  /**
   * The URI of the asset.
   */
  readonly uri: string;

  /**
   * Get the information about the asset.
   */
  getAssetInformationAsync(): Promise<NitroPlayerInformation>;
}
