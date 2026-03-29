import type { BufferConfig } from './BufferConfig';
import type { MemoryProfile, OffscreenRetention, PreloadLevel } from './MemoryConfig';

export type NitroSourceUri = number | string;
export type NitroSourceInitialization = 'eager' | 'lazy';

export interface NitroSourceMetadata {
  title?: string;
  subtitle?: string;
  description?: string;
  artist?: string;
  imageUri?: string;
}

export interface NitroSourceAdvancedLifecycleConfig {
  preloadLevel?: PreloadLevel;
  offscreenRetention?: OffscreenRetention;
  trimDelayMs?: number;
}

export interface NitroSourceAdvancedTransportConfig {
  useHlsProxy?: boolean;
}

export interface NitroSourceAdvancedConfig {
  buffer?: BufferConfig;
  lifecycle?: NitroSourceAdvancedLifecycleConfig;
  transport?: NitroSourceAdvancedTransportConfig;
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
   * High-level lifecycle preset.
   * @default 'balanced'
   */
  lifecycle?: MemoryProfile;
  /**
   * Source initialization strategy.
   * @default 'eager'
   */
  initialization?: NitroSourceInitialization;
  /**
   * Expert-only knobs that override the standard source packaging.
   */
  advanced?: NitroSourceAdvancedConfig;
}

// @internal
export interface NativeNitroPlayerConfig extends NitroSourceConfig {
  uri: string;
}
