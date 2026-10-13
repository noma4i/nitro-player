import { type NitroPlayer as NitroPlayerImpl } from '../bridge/nitro/NitroPlayer.nitro.js';
import type { NitroPlayerEventEmitter } from '../bridge/nitro/NitroPlayerEventEmitter.nitro.js';
import type { NitroPlayerSource } from '../bridge/nitro/NitroPlayerSource.nitro.js';
import type { NitroSourceDescriptor, NitroSourceInput } from '../source/types/NitroPlayerConfig.js';
import type { NitroPlaybackPolicy } from '../surface/NitroPlaybackPolicy.js';
import { NitroPlayerEvents } from './NitroPlayerEvents.js';
import type { PlaybackState } from './types/PlaybackState.js';
declare class NitroPlayer extends NitroPlayerEvents {
    private _player;
    private _source;
    private _nativeSource;
    private readonly _ownsNativePlayer;
    private _pendingSourceCommandId;
    private _sourceCommandId;
    private _resumePosition;
    protected get eventEmitter(): NitroPlayerEventEmitter;
    protected get player(): NitroPlayerImpl;
    constructor(source: NitroSourceInput | NitroPlayerSource | NitroPlayerImpl);
    static __fromNativePlayer(player: NitroPlayerImpl): NitroPlayer;
    __createNativePlayer(source: NitroSourceDescriptor): void;
    /**
     * Releases the player's native resources and releases native state.
     * @internal
     */
    __destroy(): void;
    private refreshNativeMemorySize;
    /**
     * Returns the native (hybrid) player instance.
     * Should not be used outside of the module.
     * @internal
     */
    __getNativePlayer(): NitroPlayerImpl;
    private parseError;
    private static isNativePlayer;
    /**
     * Updates the memory size of the player and its source. Should be called after any operation that changes the memory size of the player or its source.
     * @internal
     */
    private refreshMemorySize;
    private runSync;
    private runAsync;
    get playbackState(): PlaybackState;
    tryReadPlaybackState(): PlaybackState | null;
    set rate(value: number);
    configurePlayback(key: string, policy: NitroPlaybackPolicy, requiresView: boolean): void;
    updatePlayback(active: boolean, visible: boolean, muted: boolean, loop: boolean): void;
    requestPlayback(): void;
    requestIdle(): void;
    seekTo(time: number): void;
    replaceSourceAsync(source: NitroSourceInput): Promise<void>;
}
export { NitroPlayer };
//# sourceMappingURL=NitroPlayer.d.ts.map