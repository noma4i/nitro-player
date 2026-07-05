import { NitroPlayer } from '../NitroPlayer';
import type { PlaybackState } from '../types/PlaybackState';
export type PlaybackStateSelector<Selected> = (state: PlaybackState) => Selected;
export declare function usePlaybackState(player: NitroPlayer | null | undefined): PlaybackState | null;
export declare function usePlaybackState<Selected>(player: NitroPlayer | null | undefined, selector: PlaybackStateSelector<Selected>): Selected | null;
//# sourceMappingURL=usePlaybackState.d.ts.map