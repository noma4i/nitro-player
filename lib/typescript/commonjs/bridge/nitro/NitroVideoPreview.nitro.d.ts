import type { HybridObject } from 'react-native-nitro-modules';
export interface NitroVideoPreview extends HybridObject<{
    ios: 'swift';
    android: 'kotlin';
}> {
    getThumbnailUrl(url: string, headers?: Record<string, string>): Promise<string | null>;
    peekThumbnailUrl(url: string, headers?: Record<string, string>): Promise<string | null>;
    clearPreview(): Promise<boolean>;
}
//# sourceMappingURL=NitroVideoPreview.nitro.d.ts.map