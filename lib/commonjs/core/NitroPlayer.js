"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NitroPlayer = void 0;
var _reactNative = require("react-native");
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _NitroPlayerError = require("./types/NitroPlayerError.js");
var _playerFactory = require("./utils/playerFactory.js");
var _sourceFactory = require("./utils/sourceFactory.js");
var _NitroPlayerEvents = require("./NitroPlayerEvents.js");
class NitroPlayer extends _NitroPlayerEvents.NitroPlayerEvents {
  get player() {
    if (this._player === undefined) {
      throw new _NitroPlayerError.NitroPlayerRuntimeError('player/released', "You can't access player after it's released");
    }
    return this._player;
  }
  constructor(source) {
    const hybridSource = (0, _sourceFactory.createNitroSource)(source);
    const player = (0, _playerFactory.createPlayer)(hybridSource);

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
      _reactNativeNitroModules.NitroModules.updateMemorySize(nativePlayer);
      _reactNativeNitroModules.NitroModules.updateMemorySize(nativeSource);
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
  throwError(error) {
    throw (0, _NitroPlayerError.tryParseNativeNitroPlayerError)(error);
  }

  /**
   * Updates the memory size of the player and its source. Should be called after any operation that changes the memory size of the player or its source.
   * @internal
   */
  updateMemorySize() {
    _reactNativeNitroModules.NitroModules.updateMemorySize(this.player);
    _reactNativeNitroModules.NitroModules.updateMemorySize(this.player.source);
  }

  /**
   * Wraps a promise to try parsing native errors to NitroPlayerRuntimeError
   * @internal
   */
  wrapPromise(promise) {
    return new Promise((resolve, reject) => {
      promise.then(resolve).catch(error => {
        reject(this.throwError(error));
      });
    });
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
    if (__DEV__ && !['ios'].includes(_reactNative.Platform.OS)) {
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
  get isReadyToDisplay() {
    return this.playbackState.isReadyToDisplay;
  }
  async initialize() {
    await this.wrapPromise(this.player.initialize());
    this.updateMemorySize();
  }
  async preload() {
    await this.wrapPromise(this.player.preload());
    this.updateMemorySize();
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
    try {
      this.player.play();
    } catch (error) {
      this.throwError(error);
    }
  }
  pause() {
    try {
      this.player.pause();
    } catch (error) {
      this.throwError(error);
    }
  }
  seekBy(time) {
    try {
      this.player.seekBy(time);
    } catch (error) {
      this.throwError(error);
    }
  }
  seekTo(time) {
    try {
      this.player.seekTo(time);
    } catch (error) {
      this.throwError(error);
    }
  }
  async replaceSourceAsync(source) {
    this.updateMemorySize();
    await this.wrapPromise(this.player.replaceSourceAsync((0, _sourceFactory.createNitroSource)(source)));
    this.updateMemorySize();
  }
  async clearSourceAsync() {
    this.updateMemorySize();
    await this.wrapPromise(this.player.clearSourceAsync());
    this.updateMemorySize();
  }
}
exports.NitroPlayer = NitroPlayer;
//# sourceMappingURL=NitroPlayer.js.map