import { Platform } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import { type NitroPlayer as NitroPlayerImpl } from '../spec/nitro/NitroPlayer.nitro';
import type { NitroPlayerSource } from '../spec/nitro/NitroPlayerSource.nitro';
import type { IgnoreSilentSwitchMode } from './types/IgnoreSilentSwitchMode';
import type { MemorySnapshot } from './types/MemorySnapshot';
import type { MixAudioMode } from './types/MixAudioMode';
import type { PlaybackState } from './types/PlaybackState';
import type { NoAutocomplete } from './types/Utils';
import type { NitroPlayerConfig, NitroPlayerSource as NitroPlayerSourceType } from './types/NitroPlayerConfig';
import {
  tryParseNativeNitroPlayerError,
  NitroPlayerRuntimeError,
} from './types/NitroPlayerError';
import type { NitroPlayerBase } from './types/NitroPlayerBase';
import type { NitroPlayerStatus } from './types/NitroPlayerStatus';
import { createPlayer } from './utils/playerFactory';
import { createSource } from './utils/sourceFactory';
import { NitroPlayerEvents } from './NitroPlayerEvents';

class NitroPlayer extends NitroPlayerEvents implements NitroPlayerBase {
  private _player: NitroPlayerImpl | undefined;

  protected get player(): NitroPlayerImpl {
    if (this._player === undefined) {
      throw new NitroPlayerRuntimeError(
        'player/released',
        "You can't access player after it's released"
      );
    }

    return this._player;
  }

  constructor(
    source: NitroPlayerSourceType | NitroPlayerConfig | NitroPlayerSource,
    options: {
      defaultMemoryProfile?: import('./types/MemoryConfig').MemoryProfile;
    } = {}
  ) {
    const hybridSource = createSource(
      source,
      options.defaultMemoryProfile ?? 'balanced'
    );
    const player = createPlayer(hybridSource);

    // Initialize events
    super(player.eventEmitter);
    this._player = player;
  }

  /**
   * Releases the player's native resources and releases native state.
   * @internal
   */
  __destroy() {
    const nativePlayer = this._player;
    if (nativePlayer === undefined) return;

    const nativeSource = nativePlayer.source;
    this._player = undefined;

    this.clearAllEvents();

    try {
      nativePlayer.release();
    } catch (error) {
      // Best effort cleanup: teardown must never crash app unmount.
      console.error('Failed to cleanup native player resources', error);
    }

    try {
      NitroModules.updateMemorySize(nativePlayer);
      NitroModules.updateMemorySize(nativeSource);
    } catch {
      // Best effort memory accounting for released hybrid objects.
    }
  }

  /**
   * Returns the native (hybrid) player instance.
   * Should not be used outside of the module.
   * @internal
   */
  __getNativePlayer() {
    return this.player;
  }

  /**
   * Handles parsing native errors to NitroPlayerRuntimeError and calling onError if provided
   * @internal
   */
  private throwError(error: unknown) {
    const parsedError = tryParseNativeNitroPlayerError(error);

    if (
      parsedError instanceof NitroPlayerRuntimeError &&
      this.triggerJSEvent('onError', parsedError as NitroPlayerRuntimeError)
    ) {
      // We don't throw errors if onError is provided
      return;
    }

    throw parsedError;
  }

  /**
   * Updates the memory size of the player and its source. Should be called after any operation that changes the memory size of the player or its source.
   * @internal
   */
  private updateMemorySize() {
    NitroModules.updateMemorySize(this.player);
    NitroModules.updateMemorySize(this.player.source);
  }

  /**
   * Wraps a promise to try parsing native errors to NitroPlayerRuntimeError
   * @internal
   */
  private wrapPromise<T>(promise: Promise<T>) {
    return new Promise<T>((resolve, reject) => {
      promise.then(resolve).catch((error) => {
        reject(this.throwError(error));
      });
    });
  }

  // Source
  get source(): NitroPlayerSource {
    return this.player.source;
  }

  // Status
  get status(): NitroPlayerStatus {
    return this.playbackState.status;
  }

  get playbackState(): PlaybackState {
    return this.player.playbackState;
  }

  get memorySnapshot(): MemorySnapshot {
    return this.player.memorySnapshot;
  }

  // Duration
  get duration(): number {
    return this.playbackState.duration;
  }

  // Volume
  get volume(): number {
    return this.player.volume;
  }

  set volume(value: number) {
    this.player.volume = value;
  }

  // Current Time
  get currentTime(): number {
    return this.playbackState.currentTime;
  }

  set currentTime(value: number) {
    this.player.currentTime = value;
  }

  get bufferDuration(): number {
    return this.playbackState.bufferDuration;
  }

  get bufferedPosition(): number {
    return this.playbackState.bufferedPosition;
  }

  // Muted
  get muted(): boolean {
    return this.player.muted;
  }

  set muted(value: boolean) {
    this.player.muted = value;
  }

  // Loop
  get loop(): boolean {
    return this.player.loop;
  }

  set loop(value: boolean) {
    this.player.loop = value;
  }

  // Rate
  get rate(): number {
    return this.playbackState.rate;
  }

  set rate(value: number) {
    this.player.rate = value;
  }

  // Mix Audio Mode
  get mixAudioMode(): MixAudioMode {
    return this.player.mixAudioMode;
  }

  set mixAudioMode(value: MixAudioMode) {
    this.player.mixAudioMode = value;
  }

  // Ignore Silent Switch Mode
  get ignoreSilentSwitchMode(): IgnoreSilentSwitchMode {
    return this.player.ignoreSilentSwitchMode;
  }

  set ignoreSilentSwitchMode(value: IgnoreSilentSwitchMode) {
    if (__DEV__ && !['ios'].includes(Platform.OS)) {
      console.warn(
        'ignoreSilentSwitchMode is not supported on this platform, it wont have any effect'
      );
    }

    this.player.ignoreSilentSwitchMode = value;
  }

  // Play In Background
  get playInBackground(): boolean {
    return this.player.playInBackground;
  }

  set playInBackground(value: boolean) {
    this.player.playInBackground = value;
  }

  // Play When Inactive
  get playWhenInactive(): boolean {
    return this.player.playWhenInactive;
  }

  set playWhenInactive(value: boolean) {
    this.player.playWhenInactive = value;
  }

  // Is Playing
  get isPlaying(): boolean {
    return this.playbackState.isPlaying;
  }

  get isBuffering(): boolean {
    return this.playbackState.isBuffering;
  }

  get isReadyToDisplay(): boolean {
    return this.playbackState.isReadyToDisplay;
  }

  async initialize(): Promise<void> {
    await this.wrapPromise(this.player.initialize());

    this.updateMemorySize();
  }

  async preload(): Promise<void> {
    await this.wrapPromise(this.player.preload());

    this.updateMemorySize();
  }

  /**
   * Releases the player's native resources and releases native state.
   * After calling this method, the player is no longer usable.
   * Accessing any properties or methods of the player after calling this method will throw an error.
   * If you want to clean player resource use `replaceSourceAsync` with `null` instead.
   */
  release(): void {
    this.__destroy();
  }

  play(): void {
    try {
      this.player.play();
    } catch (error) {
      this.throwError(error);
    }
  }

  pause(): void {
    try {
      this.player.pause();
    } catch (error) {
      this.throwError(error);
    }
  }

  seekBy(time: number): void {
    try {
      this.player.seekBy(time);
    } catch (error) {
      this.throwError(error);
    }
  }

  seekTo(time: number): void {
    try {
      this.player.seekTo(time);
    } catch (error) {
      this.throwError(error);
    }
  }

  async replaceSourceAsync(
    source: NitroPlayerSourceType | NitroPlayerConfig | NoAutocomplete<NitroPlayerSource> | null
  ): Promise<void> {
    this.updateMemorySize();

    await this.wrapPromise(
      this.player.replaceSourceAsync(
        source === null ? null : createSource(source)
      )
    );

    this.updateMemorySize();
  }

}

export { NitroPlayer };
