import type { VideoPlayerStatus } from './VideoPlayerStatus';

export interface PlaybackState {
  status: VideoPlayerStatus;
  currentTime: number;
  duration: number;
  bufferDuration: number;
  bufferedPosition: number;
  rate: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isReadyToDisplay: boolean;
  nativeTimestampMs: number;
}
