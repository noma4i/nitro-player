import XCTest

final class PlaybackWatchdogRecoveryTests: XCTestCase {
  private final class Model {
    var hasLoadedCurrentSource = true
    var wantsToPlay = true
    var generation = 1
    var attempts = 0
    var recovered = false
    var rearmed = false
    var startCount = 0
    var emittedStateCount = 0
    var currentTime = 0.0

    func play() {
      let wasPlayIntentActive = wantsToPlay
      wantsToPlay = true
      if !wasPlayIntentActive {
        attempts = 0
      }
    }

    func onReadyToPlay() {
      guard wantsToPlay else { return }
      startCount += 1
      rearmed = true
    }

    func completeSeamlessLoopSeek(rate: Double) {
      guard wantsToPlay else { return }
      if rate == 0 {
        startCount += 1
      }
      currentTime = 0
      emittedStateCount += 1
    }

    func tick(
      startSeconds: Double,
      currentSeconds: Double,
      durationSeconds: Double = Double.nan,
      isPlaying: Bool,
      loop: Bool = false,
      generationAtArm: Int = 1
    ) {
      rearmed = false
      recovered = false

      guard wantsToPlay, generation == generationAtArm else { return }

      let changed = currentSeconds.isFinite &&
        (!startSeconds.isFinite || abs(currentSeconds - startSeconds) > 0.01)
      let isNearEnd = !loop && durationSeconds.isFinite && currentSeconds.isFinite &&
        currentSeconds >= durationSeconds - 0.25
      if isPlaying && (changed || isNearEnd) {
        attempts = 0
        rearmed = true
        return
      }

      attempts += 1
      if hasLoadedCurrentSource {
        recovered = true
      } else {
        rearmed = true
      }
    }
  }

  func testLoadedWaitingWithoutProgressRecovers() {
    let model = Model()

    model.tick(startSeconds: 0, currentSeconds: 0, isPlaying: false)

    XCTAssertTrue(model.recovered)
    XCTAssertFalse(model.rearmed)
    XCTAssertEqual(model.attempts, 1)
  }

  func testUnloadedWaitingWithoutProgressKeepsWatching() {
    let model = Model()
    model.hasLoadedCurrentSource = false

    model.tick(startSeconds: 0, currentSeconds: 0, isPlaying: false)

    XCTAssertFalse(model.recovered)
    XCTAssertTrue(model.rearmed)
    XCTAssertEqual(model.attempts, 1)
  }

  func testPlayingProgressResetsAttemptsAndRearms() {
    let model = Model()
    model.attempts = 2

    model.tick(startSeconds: 1, currentSeconds: 1.5, isPlaying: true)

    XCTAssertFalse(model.recovered)
    XCTAssertTrue(model.rearmed)
    XCTAssertEqual(model.attempts, 0)
  }

  func testFreshPlayIntentResetsExhaustedAttempts() {
    let model = Model()
    model.wantsToPlay = false
    model.attempts = 5

    model.play()

    XCTAssertTrue(model.wantsToPlay)
    XCTAssertEqual(model.attempts, 0)
  }

  func testLoopWrapReadsAsHealthyAdvancement() {
    let model = Model()
    model.attempts = 2

    model.tick(
      startSeconds: 29.5,
      currentSeconds: 0.2,
      durationSeconds: 30,
      isPlaying: true,
      loop: true
    )

    XCTAssertFalse(model.recovered)
    XCTAssertTrue(model.rearmed)
    XCTAssertEqual(model.attempts, 0)
  }

  func testLoopPinnedNearEndRecoversInsteadOfRearming() {
    let model = Model()

    model.tick(
      startSeconds: 29.8,
      currentSeconds: 29.8,
      durationSeconds: 30,
      isPlaying: true,
      loop: true
    )

    XCTAssertTrue(model.recovered)
    XCTAssertFalse(model.rearmed)
    XCTAssertEqual(model.attempts, 1)
  }

  func testNonLoopNearEndKeepsWatchingWithoutRecovery() {
    let model = Model()
    model.attempts = 2

    model.tick(
      startSeconds: 29.8,
      currentSeconds: 29.8,
      durationSeconds: 30,
      isPlaying: true
    )

    XCTAssertFalse(model.recovered)
    XCTAssertTrue(model.rearmed)
    XCTAssertEqual(model.attempts, 0)
  }

  func testPostLoopSeekKicksPlaybackWhenRateIsZero() {
    let model = Model()
    model.currentTime = 29.8

    model.completeSeamlessLoopSeek(rate: 0)

    XCTAssertEqual(model.startCount, 1)
    XCTAssertEqual(model.currentTime, 0)
    XCTAssertEqual(model.emittedStateCount, 1)
  }

  func testPostLoopSeekDoesNotKickWhenRateIsAlreadyPlaying() {
    let model = Model()
    model.currentTime = 29.8

    model.completeSeamlessLoopSeek(rate: 1)

    XCTAssertEqual(model.startCount, 0)
    XCTAssertEqual(model.currentTime, 0)
    XCTAssertEqual(model.emittedStateCount, 1)
  }

  func testReadyToPlayCommitsPendingPlayIntent() {
    let model = Model()
    model.wantsToPlay = true

    model.onReadyToPlay()

    XCTAssertEqual(model.startCount, 1)
    XCTAssertTrue(model.rearmed)
  }
}
