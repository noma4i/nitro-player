import type { NitroPlayerInformation } from '../../player/types/NitroPlayerInformation.js';
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
//# sourceMappingURL=NitroPlayerSourceBase.d.ts.map