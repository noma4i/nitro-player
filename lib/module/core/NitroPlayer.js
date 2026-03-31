"use strict";

import { Platform } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import { tryParseNativeNitroPlayerError, NitroPlayerRuntimeError } from "./types/NitroPlayerError.js";
import { createPlayer } from "./utils/playerFactory.js";
import { createNitroSource } from "./utils/sourceFactory.js";
import { NitroPlayerEvents } from "./NitroPlayerEvents.js";
class NitroPlayer extends NitroPlayerEvents {
  get player() {
    if (this._player === undefined) {
      throw new NitroPlayerRuntimeError('player/released', "You can't access player after it's released");
    }
    return this._player;
  }
  constructor(source) {
    const hybridSource = createNitroSource(source);
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
  parseError(error) {
    return tryParseNativeNitroPlayerError(error);
  }

  /**
   * Updates the memory size of the player and its source. Should be called after any operation that changes the memory size of the player or its source.
   * @internal
   */
  refreshMemorySize() {
    NitroModules.updateMemorySize(this.player);
    NitroModules.updateMemorySize(this.player.source);
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
    return this.player.source;
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
    this.refreshMemorySize();
    await this.runAsync(() => this.player.replaceSourceAsync(createNitroSource(source)));
    this.refreshMemorySize();
  }
  async clearSourceAsync() {
    this.refreshMemorySize();
    await this.runAsync(() => this.player.clearSourceAsync());
    this.refreshMemorySize();
  }
}
export { NitroPlayer };
//# sourceMappingURL=NitroPlayer.js.map