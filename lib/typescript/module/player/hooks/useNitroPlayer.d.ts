import type { NitroPlayerSource } from '../../bridge/nitro/NitroPlayerSource.nitro';
import type { NitroSourceInput } from '../../source/types/NitroPlayerConfig';
import { NitroPlayer } from '../NitroPlayer';
/**
 * Creates a `NitroPlayer` instance and manages its lifecycle.
 * @param source - The source of the video to play
 * @returns The `NitroPlayer` instance
 */
export declare const useNitroPlayer: (source: NitroSourceInput | NitroPlayerSource) => NitroPlayer;
//# sourceMappingURL=useNitroPlayer.d.ts.map