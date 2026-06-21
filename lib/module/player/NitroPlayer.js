"use strict";

import { Platform } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import { tryParseNativeNitroPlayerError, NitroPlayerRuntimeError } from "../support/errors/NitroPlayerError.js";
import { createPlayer } from "./playerFactory.js";
import { createNativeNitroSource } from "../source/sourceFactory.js";
import { prepareSource } from "../source/prepareSource.js";
import { NitroPlayerEvents } from "./NitroPlayerEvents.js";
class NitroPlayer extends NitroPlayerEvents {
  get player() {
    if (this._player === undefined) {
      throw new NitroPlayerRuntimeError('player/released', "You can't access player after it's released");
    }
    return this._player;
  }
  constructor(source) {
    const player = createPlayer(source);

    // Initialize events
    super(player.eventEmitter);
    this._player = player;
    this._source = prepareSource(source);
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
  parseError(error) {
    return tryParseNativeNitroPlayerError(error);
  }

  /**
   * Updates the memory size of the player and its source. Should be called after any operation that changes the memory size of the player or its source.
   * @internal
   */
  refreshMemorySize() {
    // No-op once released: async paths (initialize/preload/replace/clear) call
    // this after awaiting a native promise, and release() may have run during
    // the await — accessing `this.player` would throw `player/released`.
    if (this._player === undefined) {
      return;
    }
    NitroModules.updateMemorySize(this._player);
    NitroModules.updateMemorySize(this._player.source);
  }
  runSync(operation) {
    try {
      return operation();
    } catch (error) {
      throw this.parseError(error);
    }
  }
  async runAsync(operation) {
    try {
      return await operation();
    } catch (error) {
      throw this.parseError(error);
    }
  }

  // Source
  get source() {
    this.player;
    return this._source;
  }

  // Status
  get status() {
    return this.playbackState.status;
  }
  get playbackState() {
    return this.player.playbackState;
  }
  get memorySnapshot() {
    return this.player.memorySnapshot;
  }

  // Duration
  get duration() {
    return this.playbackState.duration;
  }

  // Volume
  get volume() {
    return this.player.volume;
  }
  set volume(value) {
    this.player.volume = value;
  }

  // Current Time
  get currentTime() {
    return this.playbackState.currentTime;
  }
  set currentTime(value) {
    this.player.currentTime = value;
  }
  get bufferDuration() {
    return this.playbackState.bufferDuration;
  }
  get bufferedPosition() {
    return this.playbackState.bufferedPosition;
  }

  // Muted
  get muted() {
    return this.player.muted;
  }
  set muted(value) {
    this.player.muted = value;
  }

  // Loop
  get loop() {
    return this.player.loop;
  }
  set loop(value) {
    this.player.loop = value;
  }

  // Rate
  get rate() {
    return this.playbackState.rate;
  }
  set rate(value) {
    this.player.rate = value;
  }

  // Mix Audio Mode
  get mixAudioMode() {
    return this.player.mixAudioMode;
  }
  set mixAudioMode(value) {
    this.player.mixAudioMode = value;
  }

  // Ignore Silent Switch Mode
  get ignoreSilentSwitchMode() {
    return this.player.ignoreSilentSwitchMode;
  }
  set ignoreSilentSwitchMode(value) {
    if (__DEV__ && !['ios'].includes(Platform.OS)) {
      console.warn('ignoreSilentSwitchMode is not supported on this platform, it wont have any effect');
    }
    this.player.ignoreSilentSwitchMode = value;
  }

  // Play In Background
  get playInBackground() {
    return this.player.playInBackground;
  }
  set playInBackground(value) {
    this.player.playInBackground = value;
  }

  // Play When Inactive
  get playWhenInactive() {
    return this.player.playWhenInactive;
  }
  set playWhenInactive(value) {
    this.player.playWhenInactive = value;
  }

  // Is Playing
  get isPlaying() {
    return this.playbackState.isPlaying;
  }
  get isBuffering() {
    return this.playbackState.isBuffering;
  }
  get isVisualReady() {
    return this.playbackState.isVisualReady;
  }
  async initialize() {
    await this.runAsync(() => this.player.initialize());
    this.refreshMemorySize();
  }
  async preload() {
    await this.runAsync(() => this.player.preload());
    this.refreshMemorySize();
  }

  /**
   * Releases the player's native resources and releases native state.
   * After calling this method, the player is no longer usable.
   * Accessing any properties or methods of the player after calling this method will throw an error.
   * If you want to clear the current source and keep the player reusable, use `clearSourceAsync()`.
   */
  release() {
    this.__destroy();
  }
  play() {
    this.runSync(() => this.player.play());
  }
  pause() {
    this.runSync(() => this.player.pause());
  }
  seekBy(time) {
    this.runSync(() => this.player.seekBy(time));
  }
  seekTo(time) {
    this.runSync(() => this.player.seekTo(time));
  }
  async replaceSourceAsync(source) {
    const nextSource = prepareSource(source);
    if (this._source?.identity.playbackKey === nextSource.identity.playbackKey) {
      return;
    }
    this.refreshMemorySize();
    await this.runAsync(() => this.player.replaceSourceAsync(createNativeNitroSource(nextSource)));
    this._source = nextSource;
    this.refreshMemorySize();
  }
  async clearSourceAsync() {
    this.refreshMemorySize();
    await this.runAsync(() => this.player.clearSourceAsync());
    this._source = null;
    this.refreshMemorySize();
  }
}
export { NitroPlayer };
//# sourceMappingURL=NitroPlayer.js.map