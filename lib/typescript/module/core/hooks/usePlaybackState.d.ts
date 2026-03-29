import { NitroPlayer } from '../NitroPlayer';
import type { PlaybackState } from '../types/PlaybackState';
type UsePlaybackStateOptions = {
    interpolate?: boolean;
    fps?: number;
};
export declare const usePlaybackState: (player: NitroPlayer | null | undefined, options?: UsePlaybackStateOptions) => PlaybackState | null;
export {};
//# sourceMappingURL=usePlaybackState.d.ts.map