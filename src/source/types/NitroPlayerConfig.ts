import type { BufferConfig } from '../../player/types/BufferConfig';
import type { PreloadLevel, RetentionLevel } from '../../player/types/MemoryConfig';
import { unionTuple } from '../../support/typeHelpers';

export type NitroSourceUri = number | string;

// Boundary enums crossing the Nitro native bridge must be explicit string-literal
// union aliases — Nitrogen rejects `typeof tuple[number]`. Each paired runtime tuple
// is the source of truth for validation; unionTuple() fails the build on any drift.
export type NitroSourceStartup = 'eager' | 'lazy';
export const SOURCE_STARTUPS = unionTuple<NitroSourceStartup>()('eager', 'lazy');

export type NitroSourceTransportMode = 'auto' | 'direct' | 'proxy';
export const SOURCE_TRANSPORT_MODES = unionTuple<NitroSourceTransportMode>()('auto', 'direct', 'proxy');

export type NitroSourcePreviewMode = 'listener' | 'always' | 'manual';
export const SOURCE_PREVIEW_MODES = unionTuple<NitroSourcePreviewMode>()('listener', 'always', 'manual');

export type NitroSourcePolicy = 'auto' | 'feed' | 'hero' | 'thumbnail' | 'manual';
export const SOURCE_POLICIES = unionTuple<NitroSourcePolicy>()('auto', 'feed', 'hero', 'thumbnail', 'manual');

export interface NitroSourceMetadata {
  title?: string;
  subtitle?: string;
  artist?: string;
  imageUri?: string;
}

export interface NitroSourceRetentionConfig {
  preload?: PreloadLevel;
  offscreen?: RetentionLevel;
  trimDelayMs?: number;
  feedPoolEligible?: boolean;
}

export interface NitroSourceTransportConfig {
  /**
   * HLS transport routing.
   *
   * `direct` bypasses the local proxy/cache path. `proxy` opts into it. `auto`
   * is direct by default and uses the proxy only for cache-benefiting sources
   * such as feed-pool-eligible HLS items.
   */
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
   * Consumer scenario policy. Policy expands to safe defaults. Explicit
   * per-source fields win over policy defaults; object sections merge per field.
   * The `manual` policy has no defaults, so omitted sections stay undefined.
   * @default 'auto'
   */
  policy?: NitroSourcePolicy;
  /**
   * The headers to be sent with the request.
   */
  headers?: Record<string, string>;
  /**
   * Custom metadata to associate with the source.
   */
  metadata?: NitroSourceMetadata;
  /**
   * Source startup strategy. Explicit value wins over the selected policy
   * default.
   * @default 'eager'
   */
  startup?: NitroSourceStartup;
  /**
   * Explicit buffering configuration. Merges per field over the selected policy
   * default. In `NitroFeedRingPlayer` with adaptive quality, item explicit
   * buffer fields win over the adaptive decision, which wins over policy
   * defaults.
   */
  buffer?: BufferConfig;
  /**
   * Explicit retention and trim policy. Merges per field over the selected
   * policy default.
   */
  retention?: NitroSourceRetentionConfig;
  /**
   * How the source should be transported. In `auto`, ordinary HLS sources play
   * direct by default; feed-pool-eligible HLS sources keep the proxy/cache path.
   * Merges per field over the selected policy default.
   * @default 'auto'
   */
  transport?: NitroSourceTransportConfig;
  /**
   * First-frame and preview generation policy. Merges per field over the
   * selected policy default.
   */
  preview?: NitroSourcePreviewConfig;
}

export type NitroSourceInput = NitroSourceUri | NitroSourceConfig | NitroSourceDescriptor;

export interface NitroSourceIdentity {
  playbackKey: string;
}

export interface NitroSourceDescriptor {
  readonly uri: string;
  readonly headers?: Record<string, string>;
  readonly metadata?: NitroSourceMetadata;
  readonly startup?: NitroSourceStartup;
  readonly buffer?: BufferConfig;
  readonly retention?: NitroSourceRetentionConfig;
  readonly transport?: NitroSourceTransportConfig;
  readonly preview?: NitroSourcePreviewConfig;
  readonly policy: NitroSourcePolicy;
  readonly identity: NitroSourceIdentity;
}

// @internal
export interface NativeNitroPlayerConfig {
  uri: string;
  headers?: Record<string, string>;
  metadata?: NitroSourceMetadata;
  startup?: NitroSourceStartup;
  buffer?: BufferConfig;
  retention?: NitroSourceRetentionConfig;
  transport?: NitroSourceTransportConfig;
  preview?: NitroSourcePreviewConfig;
}
