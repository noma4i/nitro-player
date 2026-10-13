import Foundation

// Owns the player's lifecycle state and derived release/generation decisions.
final class LifecycleGate {
  private let lock = NSLock()
  private var storedIsReleased = false
  private var storedGeneration = 0

  var isReleased: Bool {
    lock.lock()
    defer { lock.unlock() }
    return storedIsReleased
  }

  var generation: Int {
    lock.lock()
    defer { lock.unlock() }
    return storedGeneration
  }

  // Idempotent: mirrors release()'s `if isReleased { return }`. Returns true only
  // on the transition into the released state.
  @discardableResult
  func markReleased() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if storedIsReleased { return false }
    storedIsReleased = true
    return true
  }

  // Bumps the source generation (a new source replaces the previous one) and
  // returns the new value to capture for later stale-callback checks.
  @discardableResult
  func beginGeneration() -> Int {
    lock.lock()
    defer { lock.unlock() }
    storedGeneration += 1
    return storedGeneration
  }

  // A playback-state emit is allowed only while not released.
  func shouldEmit() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return !storedIsReleased
  }

  // A deferred callback captured at `capturedGeneration` should run only if the
  // player is still alive AND the source generation has not moved on.
  func shouldDeliverCallback(capturedGeneration: Int) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return !storedIsReleased && storedGeneration == capturedGeneration
  }
}
