import type { BufferConfig } from '../player/types/BufferConfig';
import type { NitroSourcePolicy, NitroSourcePreviewConfig, NitroSourceRetentionConfig, NitroSourceStartup, NitroSourceTransportConfig } from './types/NitroPlayerConfig';
export interface NitroSourcePolicyDefaults {
    startup?: NitroSourceStartup;
    buffer?: BufferConfig;
    retention?: NitroSourceRetentionConfig;
    transport?: NitroSourceTransportConfig;
    preview?: NitroSourcePreviewConfig;
}
export interface NitroSourcePolicyOverrides {
    buffer?: BufferConfig;
}
export declare const DEFAULT_SOURCE_POLICY: NitroSourcePolicy;
export declare const SOURCE_POLICY_DEFAULTS: Record<NitroSourcePolicy, NitroSourcePolicyDefaults>;
/**
 * Configures defaults used by future source preparations for a policy.
 *
 * Precedence is explicit per-source `config.buffer`, then this configured policy
 * override, then the built-in policy default. Already prepared or attached
 * sources are not re-applied; call this before replacing a feed catalog.
 */
export declare const configureSourcePolicy: (policy: NitroSourcePolicy, overrides: NitroSourcePolicyOverrides) => void;
export declare const resolveSourcePolicyDefaults: (policy: NitroSourcePolicy) => NitroSourcePolicyDefaults;
export declare const isNitroSourcePolicy: (value: unknown) => value is NitroSourcePolicy;
//# sourceMappingURL=sourcePolicy.d.ts.map