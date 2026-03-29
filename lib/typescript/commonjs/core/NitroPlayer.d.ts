import { type NitroPlayer as NitroPlayerImpl } from '../spec/nitro/NitroPlayer.nitro';
import type { NitroPlayerSource } from '../spec/nitro/NitroPlayerSource.nitro';
import type { IgnoreSilentSwitchMode } from './types/IgnoreSilentSwitchMode';
import type { MemorySnapshot } from './types/MemorySnapshot';
import type { MixAudioMode } from './types/MixAudioMode';
import type { PlaybackState } from './types/PlaybackState';
import type { NitroSourceConfig } from './types/NitroPlayerConfig';
import type { NitroPlayerBase } from './types/NitroPlayerBase';
import type { NitroPlayerStatus } from './types/NitroPlayerStatus';
import { NitroPlayerEvents } from './NitroPlayerEvents';
declare class NitroPlayer extends NitroPlayerEvents implements NitroPlayerBase {
    private _player;
    protected get player(): NitroPlayerImpl;
    constructor(source: NitroSourceConfig | NitroPlayerSource);
    /**
     * Releases the player's native resources and releases native state.
     * @internal
     */
    __destroy(): void;
    /**
     * Returns the native (hybrid) player instance.
     * Should not be used outside of the module.
     * @internal
     */
    __getNativePlayer(): NitroPlayerImpl;
    private throwError;
    /**
     * Updates the memory size of the player and its source. Should be called after any operation that changes the memory size of the player or its source.
     * @internal
     */
    private updateMemorySize;
    /**
     * Wraps a promise to try parsing native errors to NitroPlayerRuntimeError
     * @internal
     */
    private wrapPromise;
    get source(): NitroPlayerSource;
    get status(): NitroPlayerStatus;
    get playbackState(): PlaybackState;
    get memorySnapshot(): MemorySnapshot;
    get duration(): number;
    get volume(): number;
    set volume(value: number);
    get currentTime(): number;
    set currentTime(value: number);
    get bufferDuration(): number;
    get bufferedPosition(): number;
    get muted(): boolean;
    set muted(value: boolean);
    get loop(): boolean;
    set loop(value: boolean);
    get rate(): number;
    set rate(value: number);
    get mixAudioMode(): MixAudioMode;
    set mixAudioMode(value: MixAudioMode);
    get ignoreSilentSwitchMode(): IgnoreSilentSwitchMode;
    set ignoreSilentSwitchMode(value: IgnoreSilentSwitchMode);
    get playInBackground(): boolean;
    set playInBackground(value: boolean);
    get playWhenInactive(): boolean;
    set playWhenInactive(value: boolean);
    get isPlaying(): boolean;
    get isBuffering(): boolean;
    get isReadyToDisplay(): boolean;
    initialize(): Promise<void>;
    preload(): Promise<void>;
    /**
     * Releases the player's native resources and releases native state.
     * After calling this method, the player is no longer usable.
     * Accessing any properties or methods of the player after calling this method will throw an error.
     * If you want to clear the current source and keep the player reusable, use `clearSourceAsync()`.
     */
    release(): void;
    play(): void;
    pause(): void;
    seekBy(time: number): void;
    seekTo(time: number): void;
    replaceSourceAsync(source: NitroSourceConfig | NitroPlayerSource): Promise<void>;
    clearSourceAsync(): Promise<void>;
}
export { NitroPlayer };
//# sourceMappingURL=NitroPlayer.d.ts.map