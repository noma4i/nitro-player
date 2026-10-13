"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NitroPlayer = void 0;
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _prepareSource = require("../source/prepareSource.js");
var _sourceFactory = require("../source/sourceFactory.js");
var _NitroPlayerError = require("../support/errors/NitroPlayerError.js");
var _NitroPlayerEvents = require("./NitroPlayerEvents.js");
var _playerFactory = require("./playerFactory.js");
class NitroPlayer extends _NitroPlayerEvents.NitroPlayerEvents {
  _pendingSourceCommandId = null;
  _sourceCommandId = 0;
  _resumePosition = null;
  get eventEmitter() {
    return this.player.eventEmitter;
  }
  get player() {
    if (this._player === undefined) {
      throw new _NitroPlayerError.NitroPlayerRuntimeError('player/released', "You can't access player after it's released");
    }
    return this._player;
  }
  constructor(source) {
    super();
    if (NitroPlayer.isNativePlayer(source)) {
      this._player = source;
      this._source = null;
      this._nativeSource = null;
      this._ownsNativePlayer = false;
      return;
    }
    this._source = (0, _prepareSource.prepareSource)(source);
    this._nativeSource = null;
    this._ownsNativePlayer = true;
  }
  static __fromNativePlayer(player) {
    return new NitroPlayer(player);
  }
  __createNativePlayer(source) {
    const {
      player,
      source: nativeSource
    } = (0, _playerFactory.createPlayer)(source);
    this._player = player;
    this._source = source;
    this._nativeSource = nativeSource;
    if (this._resumePosition?.playbackKey === source.identity.playbackKey) {
      player.seekTo(this._resumePosition.time);
    }
    this._resumePosition = null;
  }

  /**
   * Releases the player's native resources and releases native state.
   * @internal
   */
  __destroy() {
    const nativePlayer = this._player;
    if (nativePlayer === undefined) return;
    const resumeSource = this._ownsNativePlayer && this._pendingSourceCommandId === null ? this._source : null;
    const resumeTime = resumeSource === null ? undefined : this.tryReadPlaybackState()?.currentTime;
    this._resumePosition = resumeSource !== null && resumeTime !== undefined ? {
      playbackKey: resumeSource.identity.playbackKey,
      time: resumeTime
    } : null;
    ++this._sourceCommandId;
    this._pendingSourceCommandId = null;
    nativePlayer.eventEmitter.clearAllListeners();
    this._player = undefined;
    if (this._ownsNativePlayer) {
      this.refreshNativeMemorySize(nativePlayer);
    }
    this._nativeSource = null;
    if (this._ownsNativePlayer) {
      try {
        nativePlayer.release();
      } catch (error) {
        // Best effort cleanup: teardown must never crash app unmount.
        console.error('Failed to cleanup native player resources', error);
      }
    }
  }
  refreshNativeMemorySize(nativePlayer) {
    try {
      _reactNativeNitroModules.NitroModules.updateMemorySize(nativePlayer);
      if (this._nativeSource !== null) {
        _reactNativeNitroModules.NitroModules.updateMemorySize(this._nativeSource);
      }
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
    return (0, _NitroPlayerError.tryParseNativeNitroPlayerError)(error);
  }
  static isNativePlayer(value) {
    return Boolean(value && typeof value === 'object' && 'eventEmitter' in value && 'playbackState' in value);
  }

  /**
   * Updates the memory size of the player and its source. Should be called after any operation that changes the memory size of the player or its source.
   * @internal
   */
  refreshMemorySize() {
    if (!this._ownsNativePlayer) {
      return;
    }

    // No-op once released: replace-source paths call this after awaiting a native promise, and __destroy() may have run during
    // the await; accessing `this.player` would throw `player/released`.
    if (this._player === undefined) {
      return;
    }
    _reactNativeNitroModules.NitroModules.updateMemorySize(this._player);
    if (this._nativeSource !== null) {
      _reactNativeNitroModules.NitroModules.updateMemorySize(this._nativeSource);
    }
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
  get playbackState() {
    return this.player.playbackState;
  }
  tryReadPlaybackState() {
    try {
      return this.player.playbackState;
    } catch {
      return null;
    }
  }
  set rate(value) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError('Playback rate must be a finite positive number');
    }
    this.player.rate = value;
  }
  configurePlayback(key, policy, requiresView) {
    if (key.trim().length === 0 || policy.group.trim().length === 0) {
      throw new TypeError('Playback key and Playback group must not be blank');
    }
    if (!Number.isSafeInteger(policy.priority) || policy.priority < -2147483648 || policy.priority > 2147483647) {
      throw new RangeError('Playback priority must be a signed 32-bit integer');
    }
    this.runSync(() => this.player.configurePlayback(key, policy.group, policy.priority, policy.resume === 'automatic', requiresView));
  }
  updatePlayback(active, visible, muted, loop) {
    this.runSync(() => this.player.updatePlayback(active, visible, muted, loop));
  }
  requestPlayback() {
    this.runSync(() => this.player.requestPlayback());
  }
  requestIdle() {
    this.runSync(() => this.player.requestIdle());
  }
  seekTo(time) {
    this.runSync(() => this.player.seekTo(time));
  }
  async replaceSourceAsync(source) {
    const nextSource = (0, _prepareSource.prepareSource)(source);
    if (this._source?.identity.playbackKey === nextSource.identity.playbackKey && this._pendingSourceCommandId === null) {
      return;
    }
    const commandId = ++this._sourceCommandId;
    this._pendingSourceCommandId = commandId;
    try {
      this.refreshMemorySize();
      const nextNativeSource = (0, _sourceFactory.createNativeNitroSource)(nextSource);
      await this.runAsync(() => this.player.replaceSourceAsync(nextNativeSource));
      if (commandId !== this._sourceCommandId) {
        return;
      }
      this._source = nextSource;
      this._nativeSource = nextNativeSource;
      this.refreshMemorySize();
    } finally {
      if (this._pendingSourceCommandId === commandId) {
        this._pendingSourceCommandId = null;
      }
    }
  }
}
exports.NitroPlayer = NitroPlayer;
//# sourceMappingURL=NitroPlayer.js.map