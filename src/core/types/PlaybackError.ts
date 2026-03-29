import type { NitroPlayerErrorCode } from './NitroPlayerError';

export interface PlaybackError {
  code: NitroPlayerErrorCode;
  message: string;
}
