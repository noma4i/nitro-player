import type { NativeNitroPlayerConfig } from './NitroPlayerConfig';
import type { NitroPlayerInformation } from './NitroPlayerInformation';

export interface NitroPlayerSourceBase {
  /**
   * The URI of the asset.
   */
  readonly uri: string;

  /**
   * The config of the asset.
   */
  readonly config: NativeNitroPlayerConfig;

  /**
   * Get the information about the asset.
   */
  getAssetInformationAsync(): Promise<NitroPlayerInformation>;
}
