/**
 * The status of the player.
 * @param idle - No source is currently active.
 * @param loading - Source preparation is in progress.
 * @param buffering - Playback is stalled waiting for more data.
 * @param playing - Playback is actively advancing.
 * @param paused - Source is ready, but playback is not advancing.
 * @param ended - Playback reached the end of the stream.
 * @param error - The player has an unrecoverable error.
 */
export type VideoPlayerStatus =
  | 'idle'
  | 'loading'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';
