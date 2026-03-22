import type { NitroPlayerStatus } from './NitroPlayerStatus';

export interface PlaybackState {
  status: NitroPlayerStatus;
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
