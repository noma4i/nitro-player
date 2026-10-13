import type { NativeNitroPlayerConfig, NitroSourceDescriptor, NitroSourceInput } from './types/NitroPlayerConfig';
declare const DESCRIPTOR_BRAND = "__nitroPlaySourceDescriptor";
type DescriptorBrand = {
    readonly [DESCRIPTOR_BRAND]: true;
};
export type PreparedNitroSource = NitroSourceDescriptor & DescriptorBrand;
export declare const isPreparedSource: (source: unknown) => source is PreparedNitroSource;
export declare const prepareSource: (input: NitroSourceInput) => PreparedNitroSource;
export declare const toNativeSourceConfig: (source: NitroSourceInput) => NativeNitroPlayerConfig;
export {};
//# sourceMappingURL=prepareSource.d.ts.map