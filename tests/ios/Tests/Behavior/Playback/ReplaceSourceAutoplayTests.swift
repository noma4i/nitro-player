import XCTest

/// Mirrors the early-play intent preservation added to
/// HybridNitroPlayer.replaceSourceAsync: the prior `wantsToPlay` is captured
/// before it is reset, and after the new source is prepared the player
/// auto-resumes only when the intent was set and the generation still matches
/// and the player was not released. The real method lives in a hybrid that
/// cannot compile into the SwiftPM target (same convention as
/// PlaybackGenerationGuardTests / BufferingStateLogicTests).
final class ReplaceSourceAutoplayTests: XCTestCase {

  private final class ReplaceModel {
    var wantsToPlay: Bool
    var sourceGeneration = 0
    var isReleased = false
    private(set) var didPlay = false

    init(wantsToPlay: Bool) { self.wantsToPlay = wantsToPlay }

    /// Replace the source, then run the post-prepare completion. `advanceDuringPrepare`
    /// simulates a second replace landing while this one was still preparing;
    /// `releaseDuringPrepare` simulates teardown mid-prepare.
    func replace(advanceDuringPrepare: Bool = false, releaseDuringPrepare: Bool = false) {
      let shouldAutoPlay = wantsToPlay
      wantsToPlay = false
      sourceGeneration += 1 // beginSourceGeneration()
      let captured = sourceGeneration

      // ...prepareBufferedState() runs here...
      if advanceDuringPrepare { sourceGeneration += 1 }
      if releaseDuringPrepare { isReleased = true }

      if shouldAutoPlay {
        guard !isReleased, sourceGeneration == captured else { return }
        wantsToPlay = true
        didPlay = true
      }
    }
  }

  func testSwapWhilePlayingResumesNewSource() {
    let model = ReplaceModel(wantsToPlay: true)
    model.replace()
    XCTAssertTrue(model.didPlay)
    XCTAssertTrue(model.wantsToPlay)
  }

  func testSwapWhilePausedDoesNotAutoplay() {
    let model = ReplaceModel(wantsToPlay: false)
    model.replace()
    XCTAssertFalse(model.didPlay)
    XCTAssertFalse(model.wantsToPlay)
  }

  func testStaleReplaceDoesNotResume() {
    let model = ReplaceModel(wantsToPlay: true)
    model.replace(advanceDuringPrepare: true)
    XCTAssertFalse(model.didPlay)
  }

  func testReleaseDuringPrepareDropsAutoplay() {
    let model = ReplaceModel(wantsToPlay: true)
    model.replace(releaseDuringPrepare: true)
    XCTAssertFalse(model.didPlay)
  }
}
