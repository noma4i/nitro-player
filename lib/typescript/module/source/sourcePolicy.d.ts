import type { BufferConfig } from '../player/types/BufferConfig.js';
import type { NitroSourcePolicy, NitroSourceRetentionConfig, NitroSourceStartup, NitroSourceTransportConfig } from './types/NitroPlayerConfig.js';
export interface NitroSourcePolicyDefaults {
    startup?: NitroSourceStartup;
    buffer?: BufferConfig;
    retention?: NitroSourceRetentionConfig;
    transport?: NitroSourceTransportConfig;
}
export declare const DEFAULT_SOURCE_POLICY: NitroSourcePolicy;
export declare const resolveSourcePolicyDefaults: (policy: NitroSourcePolicy) => NitroSourcePolicyDefaults;
export declare const isNitroSourcePolicy: (value: unknown) => value is NitroSourcePolicy;
//# sourceMappingURL=sourcePolicy.d.ts.map