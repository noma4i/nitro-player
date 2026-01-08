export { useEvent } from './core/hooks/useEvent';
export * from './core/types/Events';
export type { IgnoreSilentSwitchMode } from './core/types/IgnoreSilentSwitchMode';
export type { MixAudioMode } from './core/types/MixAudioMode';
export type { ResizeMode } from './core/types/ResizeMode';
export type { TextTrack } from './core/types/TextTrack';
export type { VideoConfig, VideoSource } from './core/types/VideoConfig';
export {
  type LibraryError,
  type PlayerError,
  type SourceError,
  type UnknownError,
  type VideoComponentError,
  type VideoError,
  type VideoErrorCode,
  type VideoRuntimeError,
  type VideoViewError,
} from './core/types/VideoError';
export type { VideoPlayerStatus } from './core/types/VideoPlayerStatus';
export {
  default as VideoView,
  type VideoViewProps,
  type VideoViewRef,
} from './core/video-view/VideoView';
export { VideoPlayer } from './core/VideoPlayer';

// HLS Cache Proxy
export { hlsCacheProxy } from './hls/hlsCacheProxy';
export type { HlsCacheStats, Headers as HlsHeaders } from './hls/types';
