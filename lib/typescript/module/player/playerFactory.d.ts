import type { NitroPlayer } from '../bridge/nitro/NitroPlayer.nitro.js';
import type { NitroPlayerSource } from '../bridge/nitro/NitroPlayerSource.nitro.js';
import type { NitroSourceInput } from '../source/types/NitroPlayerConfig.js';
export interface CreatedNitroPlayer {
    player: NitroPlayer;
    source: NitroPlayerSource;
}
/**
 * @internal
 * Creates a Native NitroPlayer instance.
 *
 * @param source - The source of the video to play
 * @returns The Native NitroPlayer instance
 */
export declare const createPlayer: (source: NitroSourceInput | NitroPlayerSource) => CreatedNitroPlayer;
//# sourceMappingURL=playerFactory.d.ts.map