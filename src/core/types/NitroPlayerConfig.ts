import type { BufferConfig } from './BufferConfig';
import type { MemoryConfig } from './MemoryConfig';

export type NitroPlayerSource = number | string;

export type NitroPlayerConfig = {
  /**
   * The uri of the video.
   * @example
   * ```ts
   * uri: 'https://example.com/video.mp4'
   * // or
   * uri: require('./assets/video.mp4')
   * ```
   */
  uri: NitroPlayerSource;
  /**
   * The headers to be sent with the request.
   */
  headers?: Record<string, string>;
  /**
   * The player buffer configuration.
   */
  bufferConfig?: BufferConfig;
  /**
   * Memory lifecycle policy for the native player/source.
   */
  memoryConfig?: MemoryConfig;
  /**
   * The custom metadata to be associated with the video.
   */
  metadata?: CustomVideoMetadata;
  /**
   * when the player is created, this flag will determine if native player should be initialized immediately.
   * @default true
   */
  initializeOnCreation?: boolean;
  /**
   * Whether to route this source through the HLS cache proxy.
   * Only applies to `.m3u8` URLs. Non-HLS sources are never proxied.
   * @default true
   */
  useHlsProxy?: boolean;
};

// @internal
export interface NativeNitroPlayerConfig extends NitroPlayerConfig {
  uri: string;
  memoryConfig?: MemoryConfig;
}

interface CustomVideoMetadata {
  title?: string;
  subtitle?: string;
  description?: string;
  artist?: string;
  imageUri?: string;
}
