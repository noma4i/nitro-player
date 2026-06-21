import type { NitroPlayer } from '../bridge/nitro/NitroPlayer.nitro';
import type { NitroPlayerSource } from '../bridge/nitro/NitroPlayerSource.nitro';
import type { NitroSourceConfig } from '../source/types/NitroPlayerConfig';
/**
 * @internal
 * Creates a Native NitroPlayer instance.
 *
 * @param source - The source of the video to play
 * @returns The Native NitroPlayer instance
 */
export declare const createPlayer: (source: NitroSourceConfig | NitroPlayerSource) => NitroPlayer;
//# sourceMappingURL=playerFactory.d.ts.map