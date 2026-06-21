import Foundation

// Nitro-free owner of the player's pure lifecycle state (released flag + source
// generation) and the decisions derived from them. Extracted from
// HybridNitroPlayer so the release/generation guard logic is unit-testable in the
// headless SwiftPM target (the hybrid itself is a C++-backed Nitro object that
// cannot be instantiated there). HybridNitroPlayer forwards its isReleased /
// sourceGeneration to this gate and routes its two write sites through it.
//
// Intentionally lock-free, matching the prior plain-var semantics: a detached
// callback may observe a just-flipped flag, which the "recheck isReleased in
// detached callbacks" convention already tolerates (the guarded path no-ops).
final class LifecycleGate {
  private(set) var isReleased = false
  private(set) var generation = 0

  // Idempotent: mirrors release()'s `if isReleased { return }`. Returns true only
  // on the transition into the released state.
  @discardableResult
  func markReleased() -> Bool {
    if isReleased { return false }
    isReleased = true
    return true
  }

  // Bumps the source generation (a new source replaces the previous one) and
  // returns the new value to capture for later stale-callback checks.
  @discardableResult
  func beginGeneration() -> Int {
    generation += 1
    return generation
  }

  // A playback-state emit is allowed only while not released.
  func shouldEmit() -> Bool {
    !isReleased
  }

  // A deferred callback captured at `capturedGeneration` should run only if the
  // player is still alive AND the source generation has not moved on.
  func shouldDeliverCallback(capturedGeneration: Int) -> Bool {
    !isReleased && generation == capturedGeneration
  }
}
