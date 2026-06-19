import XCTest

/// Mirrors the sourceGeneration guard added to HybridNitroPlayer.play()'s detached
/// Task completion: a play()/fail outcome from a prepare that finished after the
/// source was replaced must be dropped, so a stale failure never fails/recovers the
/// new source. The real method lives in a hybrid that cannot compile into the
/// SwiftPM target (same convention as PlaybackEmitGateTests / BufferingStateLogicTests).
final class PlaybackGenerationGuardTests: XCTestCase {

  private final class PlayModel {
    var sourceGeneration = 0
    var isReleased = false
    var wantsToPlay = true
    private(set) var didPlay = false
    private(set) var didFail = false

    func applySuccess(capturedGeneration: Int) {
      guard !isReleased, sourceGeneration == capturedGeneration, wantsToPlay else { return }
      didPlay = true
    }

    func applyFailure(capturedGeneration: Int) {
      guard !isReleased, sourceGeneration == capturedGeneration else { return }
      didFail = true
    }
  }

  func testStaleSuccessIsDroppedAfterSourceReplaced() {
    let model = PlayModel()
    let captured = model.sourceGeneration
    model.sourceGeneration += 1 // source replaced while preparing
    model.applySuccess(capturedGeneration: captured)
    XCTAssertFalse(model.didPlay)
  }

  func testStaleFailureDoesNotFailNewSource() {
    let model = PlayModel()
    let captured = model.sourceGeneration
    model.sourceGeneration += 1
    model.applyFailure(capturedGeneration: captured)
    XCTAssertFalse(model.didFail)
  }

  func testCurrentGenerationSuccessPlays() {
    let model = PlayModel()
    let captured = model.sourceGeneration
    model.applySuccess(capturedGeneration: captured)
    XCTAssertTrue(model.didPlay)
  }

  func testReleasedDropsBothOutcomes() {
    let model = PlayModel()
    let captured = model.sourceGeneration
    model.isReleased = true
    model.applySuccess(capturedGeneration: captured)
    model.applyFailure(capturedGeneration: captured)
    XCTAssertFalse(model.didPlay)
    XCTAssertFalse(model.didFail)
  }
}
