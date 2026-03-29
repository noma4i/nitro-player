import type { NitroPlayer } from '../../spec/nitro/NitroPlayer.nitro';
import type { NitroPlayerSource } from '../../spec/nitro/NitroPlayerSource.nitro';
import type { NitroSourceConfig } from '../types/NitroPlayerConfig';
/**
 * @internal
 * Creates a Native NitroPlayer instance.
 *
 * @param source - The source of the video to play
 * @returns The Native NitroPlayer instance
 */
export declare const createPlayer: (source: NitroSourceConfig | NitroPlayerSource) => NitroPlayer;
//# sourceMappingURL=playerFactory.d.ts.map