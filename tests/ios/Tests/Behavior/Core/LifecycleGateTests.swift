import XCTest
@testable import NitroPlayLogic

// Exercises the real production lifecycle seam (LifecycleGate) that
// HybridNitroPlayer now forwards isReleased / sourceGeneration to. Replaces the
// previous copied-model approach (a local PlayModel re-declaring the decisions),
// which docs/testing-behavior-matrix.md forbids.
final class LifecycleGateTests: XCTestCase {
  func test_initialState_notReleased_generationZero() {
    let gate = LifecycleGate()
    XCTAssertFalse(gate.isReleased)
    XCTAssertEqual(gate.generation, 0)
    XCTAssertTrue(gate.shouldEmit())
  }

  func test_markReleased_isIdempotent() {
    let gate = LifecycleGate()
    XCTAssertTrue(gate.markReleased())
    XCTAssertTrue(gate.isReleased)
    XCTAssertFalse(gate.markReleased())
  }

  // The core emit-after-release guard: once released, no playback-state emit.
  func test_releasedPlayer_doesNotEmit() {
    let gate = LifecycleGate()
    gate.markReleased()
    XCTAssertFalse(gate.shouldEmit())
  }

  func test_beginGeneration_incrementsAndReturns() {
    let gate = LifecycleGate()
    XCTAssertEqual(gate.beginGeneration(), 1)
    XCTAssertEqual(gate.beginGeneration(), 2)
    XCTAssertEqual(gate.generation, 2)
  }

  // A deferred callback captured before a source swap must be dropped.
  func test_shouldDeliverCallback_staleGenerationDropped() {
    let gate = LifecycleGate()
    let captured = gate.beginGeneration()
    XCTAssertTrue(gate.shouldDeliverCallback(capturedGeneration: captured))
    _ = gate.beginGeneration()
    XCTAssertFalse(gate.shouldDeliverCallback(capturedGeneration: captured))
  }

  // A deferred callback must also be dropped once the player is released.
  func test_shouldDeliverCallback_releasedDropped() {
    let gate = LifecycleGate()
    let captured = gate.beginGeneration()
    gate.markReleased()
    XCTAssertFalse(gate.shouldDeliverCallback(capturedGeneration: captured))
  }
}
