import type { BufferConfig } from './BufferConfig';
import type { OffscreenRetention, PreloadLevel } from './MemoryConfig';
export type NitroSourceUri = number | string;
export type NitroSourceStartup = 'eager' | 'lazy';
export type NitroSourceTransportMode = 'auto' | 'direct' | 'proxy';
export type NitroSourcePreviewMode = 'listener' | 'always' | 'manual';
export interface NitroSourceMetadata {
    title?: string;
    subtitle?: string;
    description?: string;
    artist?: string;
    imageUri?: string;
}
export interface NitroSourceRetentionConfig {
    preload?: PreloadLevel;
    offscreen?: OffscreenRetention;
    trimDelayMs?: number;
    feedPoolEligible?: boolean;
}
export interface NitroSourceTransportConfig {
    mode?: NitroSourceTransportMode;
}
export interface NitroSourcePreviewConfig {
    mode?: NitroSourcePreviewMode;
    autoThumbnail?: boolean;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
}
export interface NitroSourceConfig {
    /**
     * The uri of the video.
     * Accepts a network/local URL string or a React Native asset reference.
     */
    uri: NitroSourceUri;
    /**
     * The headers to be sent with the request.
     */
    headers?: Record<string, string>;
    /**
     * Custom metadata to associate with the source.
     */
    metadata?: NitroSourceMetadata;
    /**
     * Source startup strategy.
     * @default 'eager'
     */
    startup?: NitroSourceStartup;
    /**
     * Explicit buffering configuration.
     */
    buffer?: BufferConfig;
    /**
     * Explicit retention and trim policy.
     */
    retention?: NitroSourceRetentionConfig;
    /**
     * How the source should be transported.
     * @default 'auto'
     */
    transport?: NitroSourceTransportConfig;
    /**
     * First-frame and preview generation policy.
     */
    preview?: NitroSourcePreviewConfig;
}
export interface NativeNitroPlayerConfig extends NitroSourceConfig {
    uri: string;
}
//# sourceMappingURL=NitroPlayerConfig.d.ts.map