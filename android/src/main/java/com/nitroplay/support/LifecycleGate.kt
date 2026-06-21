package com.nitroplay.video.core

// Nitro-free owner of the player's pure lifecycle state (released flag + source
// generation) and the decisions derived from them. Mirror of the iOS
// LifecycleGate. HybridNitroPlayer forwards its isReleased / sourceGeneration to
// this gate and routes its two write sites through it, so the release/generation
// guard logic is unit-testable without instantiating the ExoPlayer-backed hybrid.
class LifecycleGate {
  var isReleased = false
    private set
  var generation = 0
    private set

  // Idempotent: returns true only on the transition into the released state.
  fun markReleased(): Boolean {
    if (isReleased) return false
    isReleased = true
    return true
  }

  // Bumps the source generation and returns the new value to capture for later
  // stale-callback checks.
  fun beginGeneration(): Int {
    generation += 1
    return generation
  }

  // A playback-state emit is allowed only while not released.
  fun shouldEmit(): Boolean = !isReleased

  // A deferred callback captured at [capturedGeneration] should run only if the
  // player is still alive AND the source generation has not moved on.
  fun shouldDeliverCallback(capturedGeneration: Int): Boolean =
    !isReleased && generation == capturedGeneration
}
