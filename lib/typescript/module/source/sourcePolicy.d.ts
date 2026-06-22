import type { BufferConfig } from '../player/types/BufferConfig';
import type { NitroSourcePolicy, NitroSourcePreviewConfig, NitroSourceRetentionConfig, NitroSourceStartup, NitroSourceTransportConfig } from './types/NitroPlayerConfig';
export interface NitroSourcePolicyDefaults {
    startup?: NitroSourceStartup;
    buffer?: BufferConfig;
    retention?: NitroSourceRetentionConfig;
    transport?: NitroSourceTransportConfig;
    preview?: NitroSourcePreviewConfig;
}
export declare const DEFAULT_SOURCE_POLICY: NitroSourcePolicy;
export declare const SOURCE_POLICY_DEFAULTS: Record<NitroSourcePolicy, NitroSourcePolicyDefaults>;
export declare const isNitroSourcePolicy: (value: unknown) => value is NitroSourcePolicy;
//# sourceMappingURL=sourcePolicy.d.ts.map