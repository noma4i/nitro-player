import { NitroModules } from 'react-native-nitro-modules';
import { type NitroPlayer as NitroPlayerImpl } from '../bridge/nitro/NitroPlayer.nitro';
import type { NitroPlayerEventEmitter } from '../bridge/nitro/NitroPlayerEventEmitter.nitro';
import type { NitroPlayerSource } from '../bridge/nitro/NitroPlayerSource.nitro';
import { prepareSource } from '../source/prepareSource';
import { createNativeNitroSource } from '../source/sourceFactory';
import type { NitroSourceDescriptor, NitroSourceInput } from '../source/types/NitroPlayerConfig';
import { NitroPlayerRuntimeError, tryParseNativeNitroPlayerError } from '../support/errors/NitroPlayerError';
import type { NitroPlaybackPolicy } from '../surface/NitroPlaybackPolicy';
import { NitroPlayerEvents } from './NitroPlayerEvents';
import { createPlayer } from './playerFactory';
import type { PlaybackState } from './types/PlaybackState';

class NitroPlayer extends NitroPlayerEvents {
  private _player: NitroPlayerImpl | undefined;
  private _source: NitroSourceDescriptor | null;
  private _nativeSource: NitroPlayerSource | null;
  private readonly _ownsNativePlayer: boolean;
  private _pendingSourceCommandId: number | null = null;
  private _sourceCommandId = 0;
  private _resumePosition: { playbackKey: string; time: number } | null = null;

  protected get eventEmitter(): NitroPlayerEventEmitter {
    return this.player.eventEmitter;
  }

  protected get player(): NitroPlayerImpl {
    if (this._player === undefined) {
      throw new NitroPlayerRuntimeError('player/released', "You can't access player after it's released");
    }

    return this._player;
  }

  constructor(source: NitroSourceInput | NitroPlayerSource | NitroPlayerImpl) {
    super();
    if (NitroPlayer.isNativePlayer(source)) {
      this._player = source;
      this._source = null;
      this._nativeSource = null;
      this._ownsNativePlayer = false;
      return;
    }

    this._source = prepareSource(source);
    this._nativeSource = null;
    this._ownsNativePlayer = true;
  }

  static __fromNativePlayer(player: NitroPlayerImpl): NitroPlayer {
    return new NitroPlayer(player);
  }

  __createNativePlayer(source: NitroSourceDescriptor): void {
    const { player, source: nativeSource } = createPlayer(source);
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
  __destroy(): void {
    const nativePlayer = this._player;
    if (nativePlayer === undefined) return;

    const resumeSource = this._ownsNativePlayer && this._pendingSourceCommandId === null ? this._source : null;
    const resumeTime = resumeSource === null ? undefined : this.tryReadPlaybackState()?.currentTime;
    this._resumePosition = resumeSource !== null && resumeTime !== undefined
      ? { playbackKey: resumeSource.identity.playbackKey, time: resumeTime }
      : null;
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

  private refreshNativeMemorySize(nativePlayer: NitroPlayerImpl): void {
    try {
      NitroModules.updateMemorySize(nativePlayer);
      if (this._nativeSource !== null) {
        NitroModules.updateMemorySize(this._nativeSource);
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
  __getNativePlayer(): NitroPlayerImpl {
    return this.player;
  }

  private parseError(error: unknown): unknown {
    return tryParseNativeNitroPlayerError(error);
  }

  private static isNativePlayer(value: NitroSourceInput | NitroPlayerSource | NitroPlayerImpl): value is NitroPlayerImpl {
    return Boolean(value && typeof value === 'object' && 'eventEmitter' in value && 'playbackState' in value);
  }

  /**
   * Updates the memory size of the player and its source. Should be called after any operation that changes the memory size of the player or its source.
   * @internal
   */
  private refreshMemorySize(): void {
    if (!this._ownsNativePlayer) {
      return;
    }

    // No-op once released: replace-source paths call this after awaiting a native promise, and __destroy() may have run during
    // the await; accessing `this.player` would throw `player/released`.
    if (this._player === undefined) {
      return;
    }

    NitroModules.updateMemorySize(this._player);
    if (this._nativeSource !== null) {
      NitroModules.updateMemorySize(this._nativeSource);
    }
  }

  private runSync<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      throw this.parseError(error);
    }
  }

  private async runAsync<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.parseError(error);
    }
  }

  get playbackState(): PlaybackState {
    return this.player.playbackState;
  }

  tryReadPlaybackState(): PlaybackState | null {
    try {
      return this.player.playbackState;
    } catch {
      return null;
    }
  }

  set rate(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError('Playback rate must be a finite positive number');
    }
    this.player.rate = value;
  }

  configurePlayback(key: string, policy: NitroPlaybackPolicy, requiresView: boolean): void {
    if (key.trim().length === 0 || policy.group.trim().length === 0) {
      throw new TypeError('Playback key and Playback group must not be blank');
    }
    if (!Number.isSafeInteger(policy.priority) || policy.priority < -2147483648 || policy.priority > 2147483647) {
      throw new RangeError('Playback priority must be a signed 32-bit integer');
    }

    this.runSync(() => this.player.configurePlayback(
      key,
      policy.group,
      policy.priority,
      policy.resume === 'automatic',
      requiresView,
    ));
  }

  updatePlayback(active: boolean, visible: boolean, muted: boolean, loop: boolean): void {
    this.runSync(() => this.player.updatePlayback(active, visible, muted, loop));
  }

  requestPlayback(): void {
    this.runSync(() => this.player.requestPlayback());
  }

  requestIdle(): void {
    this.runSync(() => this.player.requestIdle());
  }

  seekTo(time: number): void {
    this.runSync(() => this.player.seekTo(time));
  }

  async replaceSourceAsync(source: NitroSourceInput): Promise<void> {
    const nextSource = prepareSource(source);
    if (this._source?.identity.playbackKey === nextSource.identity.playbackKey && this._pendingSourceCommandId === null) {
      return;
    }

    const commandId = ++this._sourceCommandId;
    this._pendingSourceCommandId = commandId;
    try {
      this.refreshMemorySize();
      const nextNativeSource = createNativeNitroSource(nextSource);
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

export { NitroPlayer };
