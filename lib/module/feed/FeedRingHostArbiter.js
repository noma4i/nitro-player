"use strict";

import { NITRO_PLAYBACK_CONTEXTS } from "../policy/playbackContexts.js";
import { addNitroForegroundListener } from "../runtime/nativePlaybackRuntime.js";
import { NitroFeedRingPlayer } from "./NitroFeedRingPlayer.js";
const RING_PLAYBACK_KEY = 'ring';
const areProjectionStatesEqual = (left, right) => left !== null && left.ringGeneration === right.ringGeneration && left.activationId === right.activationId && left.hostKey === right.hostKey && left.catalogKey === right.catalogKey && left.windowCenterIndex === right.windowCenterIndex && left.playbackIndex === right.playbackIndex && left.playbackAllowed === right.playbackAllowed && left.muted === right.muted;

/**
 * Process-wide arbiter that owns the single native feed ring and projects the
 * declared state of exactly one active host onto it.
 *
 * Host mutations (`registerHost` / `updateHost` / `unregisterHost`) may only be
 * called from the React commit phase (effects), never from render. `getBinding`
 * is a pure read safe as a `useSyncExternalStore` snapshot.
 *
 * Native owns ring lifecycle and self-healing. The arbiter never recreates the
 * ring after command events; an empty host map parks the ring, and `releaseAll`
 * is the only explicit teardown.
 */
class FeedRingHostArbiter {
  hosts = new Map();
  listeners = new Map();
  ring = null;
  commandSubscription = null;
  ringGeneration = 0;
  activationId = 0;
  projectionRevision = 0;
  lastProjectedCatalogKey = null;
  lastProjectionState = null;
  lastCreateError = null;
  lastCommandError = null;
  commandEventCounts = {
    accepted: 0,
    rejected: 0,
    applyError: 0,
    sourceError: 0
  };
  lastWindowCenterIndex = 0;
  lastPlaybackIndex = 0;
  lastMuted = false;
  activeHostKey = null;
  activeBinding = null;
  focusCounter = 0;
  dirty = false;
  converging = false;
  foregroundSubscription = null;

  /**
   * Subscribes on first use rather than at module evaluation time. This module and
   * `nativePlaybackRuntime` import each other, so a listener attached while the module graph is
   * still being evaluated would depend on which side happens to load first.
   */
  ensureForegroundSubscription() {
    if (this.foregroundSubscription !== null) {
      return;
    }
    this.foregroundSubscription = addNitroForegroundListener(() => {
      // Native owns the foreground fact; AppState events can be coalesced or missed, and the
      // previous narrow condition let a missed transition leave the ring unprojected. Projecting
      // unconditionally refreshes the native foreground epoch even when the declaration is stable.
      this.lastProjectedCatalogKey = null;
      this.lastProjectionState = null;
      this.markDirty();
    });
  }

  /** Commit phase only. */
  registerHost(hostKey, state) {
    this.ensureForegroundSubscription();
    const entry = {
      hostKey,
      state,
      focusSeq: state.focused ? ++this.focusCounter : 0
    };
    this.hosts.set(hostKey, entry);
    this.markDirty();
  }

  /** Commit phase only. */
  updateHost(hostKey, state) {
    const entry = this.hosts.get(hostKey);
    if (!entry) {
      return;
    }
    if (state.focused && !entry.state.focused) {
      entry.focusSeq = ++this.focusCounter;
    }
    entry.state = state;
    this.markDirty();
  }

  /** Imperative viewport signal (scroll subscriptions). Reads go through `getViewport`. */
  publishViewport(hostKey) {
    if (hostKey === this.activeHostKey) {
      this.markDirty();
    }
  }

  /** Commit phase only. */
  unregisterHost(hostKey) {
    if (!this.hosts.delete(hostKey)) {
      return;
    }
    this.markDirty();
  }

  /** Listeners live outside host entries so a subscription survives recreation. */
  subscribe(hostKey, listener) {
    const listeners = this.listeners.get(hostKey) ?? new Set();
    listeners.add(listener);
    this.listeners.set(hostKey, listeners);
    return () => {
      const current = this.listeners.get(hostKey);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(hostKey);
      }
    };
  }

  /** Pure read: never constructs, never mutates, stable identity between changes. */
  getBinding(hostKey) {
    if (hostKey !== this.activeHostKey) {
      return null;
    }
    return this.activeBinding;
  }

  /**
   * Releases the native ring without touching host registrations. This is the
   * only teardown path and is reserved for logout/reset; an empty host map parks
   * the ring. A host mutation recreates it lazily after an explicit release.
   */
  releaseAll() {
    this.releaseRing();
    this.refreshBinding();
  }
  getDebugSnapshot() {
    return {
      activeHostKey: this.activeHostKey,
      ringGeneration: this.ringGeneration,
      activationId: this.activationId,
      projectionRevision: this.projectionRevision,
      lastProjectedCatalogKey: this.lastProjectedCatalogKey,
      lastCreateError: this.lastCreateError,
      lastCommandError: this.lastCommandError,
      commandEventCounts: {
        ...this.commandEventCounts
      },
      ringAlive: this.ring !== null && !this.ring.isReleased,
      hosts: [...this.hosts.values()].map(entry => ({
        hostKey: entry.hostKey,
        focused: entry.state.focused,
        playbackAllowed: entry.state.playbackAllowed,
        focusSeq: entry.focusSeq,
        catalogRevision: entry.state.catalog.revision
      }))
    };
  }
  getRingSnapshot() {
    const ring = this.ring;
    if (ring === null || ring.isReleased) {
      return null;
    }
    try {
      return ring.snapshot();
    } catch {
      return null;
    }
  }
  markDirty() {
    this.dirty = true;
    if (this.converging) {
      return;
    }
    this.converging = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        this.convergeOnce();
      }
    } finally {
      this.converging = false;
    }
  }
  convergeOnce() {
    const nextActive = this.resolveActiveHost();
    const nextActiveKey = nextActive?.hostKey ?? null;
    const previousActiveKey = this.activeHostKey;
    if (this.hosts.size === 0) {
      this.activeHostKey = null;
      this.projectParked();
      this.refreshBinding();
      this.notify(previousActiveKey);
      return;
    }
    if (nextActiveKey !== previousActiveKey) {
      this.activeHostKey = nextActiveKey;
      if (nextActiveKey !== null) {
        this.activationId += 1;
      }
    }
    if (nextActive === null) {
      this.projectParked();
    } else {
      this.projectActive(nextActive);
    }
    this.refreshBinding();
    if (previousActiveKey !== this.activeHostKey) {
      this.notify(previousActiveKey);
    }
    this.notify(this.activeHostKey);
  }
  resolveActiveHost() {
    let winner = null;
    for (const entry of this.hosts.values()) {
      if (!entry.state.focused) {
        continue;
      }
      if (winner === null || entry.focusSeq > winner.focusSeq) {
        winner = entry;
      }
    }
    return winner;
  }
  projectParked() {
    const ring = this.ring;
    if (ring === null || ring.isReleased) {
      return;
    }
    this.applyProjection(ring, {
      ringGeneration: this.ringGeneration,
      activationId: this.activationId,
      hostKey: null,
      catalogKey: this.lastProjectedCatalogKey,
      windowCenterIndex: this.lastWindowCenterIndex,
      playbackIndex: this.lastPlaybackIndex,
      playbackAllowed: false,
      muted: this.lastMuted
    }, {
      windowCenterIndex: this.lastWindowCenterIndex,
      playbackIndex: this.lastPlaybackIndex,
      playbackAllowed: false,
      muted: this.lastMuted
    });
  }
  projectActive(entry) {
    const ring = this.ensureRing();
    if (ring === null) {
      return;
    }
    const registered = this.hosts.get(entry.hostKey);
    if (registered !== entry || this.activeHostKey !== entry.hostKey) {
      return;
    }
    const catalogKey = `${entry.hostKey}:${entry.state.catalog.revision}`;
    const includeCatalog = catalogKey !== this.lastProjectedCatalogKey;
    const {
      windowCenterIndex,
      playbackIndex
    } = entry.state.getViewport();
    if (!Number.isSafeInteger(windowCenterIndex) || !Number.isSafeInteger(playbackIndex)) {
      this.lastCommandError = `Feed ring viewport indices must be safe integers: ${windowCenterIndex}, ${playbackIndex}`;
      return;
    }
    if (Math.abs(playbackIndex - windowCenterIndex) > 1) {
      this.lastCommandError = `Feed ring playbackIndex must belong to the prepared window: ${playbackIndex}`;
      return;
    }
    const playbackAllowed = entry.state.focused && entry.state.playbackAllowed;
    this.applyProjection(ring, {
      ringGeneration: this.ringGeneration,
      activationId: this.activationId,
      hostKey: entry.hostKey,
      catalogKey,
      windowCenterIndex,
      playbackIndex,
      playbackAllowed,
      muted: entry.state.muted
    }, {
      catalog: includeCatalog ? entry.state.catalog : undefined,
      windowCenterIndex,
      playbackIndex,
      playbackAllowed,
      muted: entry.state.muted
    });
    if (includeCatalog) {
      this.lastProjectedCatalogKey = catalogKey;
    }
  }
  applyProjection(ring, state, projection) {
    if (areProjectionStatesEqual(this.lastProjectionState, state)) {
      return;
    }
    this.projectionRevision += 1;
    try {
      ring.applyProjection({
        revision: this.projectionRevision,
        activationId: this.activationId,
        catalog: projection.catalog,
        windowCenterIndex: projection.windowCenterIndex,
        playbackIndex: projection.playbackIndex,
        playbackAllowed: projection.playbackAllowed,
        muted: projection.muted
      });
    } catch (error) {
      this.lastCommandError = error instanceof Error ? error.message : String(error);
      return;
    }
    this.lastCommandError = null;
    this.lastWindowCenterIndex = projection.windowCenterIndex;
    this.lastPlaybackIndex = projection.playbackIndex;
    this.lastMuted = projection.muted;
    this.lastProjectionState = state;
  }
  ensureRing() {
    if (this.ring !== null && !this.ring.isReleased) {
      return this.ring;
    }
    try {
      const ring = new NitroFeedRingPlayer({
        playbackKey: RING_PLAYBACK_KEY,
        policy: NITRO_PLAYBACK_CONTEXTS.ring
      });
      this.ring = ring;
      this.lastCreateError = null;
      this.ringGeneration += 1;
      this.projectionRevision = 0;
      this.lastProjectedCatalogKey = null;
      this.lastProjectionState = null;
      this.commandSubscription = ring.addCommandEventListener(event => {
        this.handleCommandEvent(event);
      });
      return ring;
    } catch (error) {
      this.ring = null;
      this.lastCreateError = error instanceof Error ? error.message : String(error);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[FeedRingHostArbiter] create failed', this.lastCreateError);
      }
      return null;
    }
  }
  handleCommandEvent(event) {
    const ring = this.ring;
    if (ring === null || event.ringToken !== ring.ringToken) {
      return;
    }
    if (event.kind === 'accepted') {
      this.commandEventCounts.accepted += 1;
    } else if (event.kind === 'rejected') {
      this.commandEventCounts.rejected += 1;
    } else if (event.kind === 'apply-error') {
      this.commandEventCounts.applyError += 1;
      this.lastCommandError = event.error ?? null;
    } else if (event.kind === 'source-error') {
      this.commandEventCounts.sourceError += 1;
      this.lastCommandError = event.error ?? null;
    }
    if ((event.kind === 'apply-error' || event.kind === 'source-error') && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[FeedRingHostArbiter] command event', event.kind, event.error ?? '');
    }
  }
  releaseRing() {
    this.commandSubscription?.remove();
    this.commandSubscription = null;
    const ring = this.ring;
    this.ring = null;
    this.lastProjectedCatalogKey = null;
    this.lastProjectionState = null;
    if (ring === null || ring.isReleased) {
      return;
    }
    try {
      ring.release();
    } catch {
      // Release is best effort because native teardown can already be in progress.
    }
  }
  refreshBinding() {
    const ring = this.ring;
    const nextBinding = this.activeHostKey !== null && ring !== null && !ring.isReleased ? {
      ring,
      generation: this.ringGeneration,
      activationId: this.activationId
    } : null;
    const current = this.activeBinding;
    const unchanged = current !== null && nextBinding !== null && current.ring === nextBinding.ring && current.generation === nextBinding.generation && current.activationId === nextBinding.activationId;
    if (unchanged || current === nextBinding) {
      return;
    }
    this.activeBinding = nextBinding;
  }
  notify(hostKey) {
    if (hostKey === null) {
      return;
    }
    const listeners = this.listeners.get(hostKey);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener();
    }
  }
}
export const feedRingHostArbiter = new FeedRingHostArbiter();
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  const runtime = globalThis;
  runtime.__NITRO_PLAY_RING_ARBITER__ = {
    snapshot: () => feedRingHostArbiter.getDebugSnapshot(),
    ringSnapshot: () => feedRingHostArbiter.getRingSnapshot(),
    releaseAll: () => feedRingHostArbiter.releaseAll()
  };
}
//# sourceMappingURL=FeedRingHostArbiter.js.map