import XCTest
@testable import NitroPlayLogic

final class PlayIntentResolverTests: XCTestCase {

  func testResolve_isPlaying_returnsPlaying() {
    var resolver = PlayIntentResolver()
    XCTAssertEqual(resolver.resolve(isPlaying: true), .playing)
  }

  func testResolve_notPlaying_wantsToPlay_returnsKeepCurrent() {
    var resolver = PlayIntentResolver()
    resolver.onPlay()
    XCTAssertEqual(resolver.resolve(isPlaying: false), .keepCurrent)
  }

  func testResolve_notPlaying_noIntent_returnsPaused() {
    let resolver = PlayIntentResolver()
    XCTAssertEqual(resolver.resolve(isPlaying: false), .paused)
  }

  func testOnPlay_setsIntent() {
    var resolver = PlayIntentResolver()
    XCTAssertFalse(resolver.wantsToPlay)
    resolver.onPlay()
    XCTAssertTrue(resolver.wantsToPlay)
  }

  func testOnPause_clearsIntent() {
    var resolver = PlayIntentResolver()
    resolver.onPlay()
    resolver.onPause()
    XCTAssertFalse(resolver.wantsToPlay)
  }

  func testOnEnded_clearsIntent() {
    var resolver = PlayIntentResolver()
    resolver.onPlay()
    resolver.onEnded()
    XCTAssertFalse(resolver.wantsToPlay)
  }

  func testOnError_clearsIntent() {
    var resolver = PlayIntentResolver()
    resolver.onPlay()
    resolver.onError()
    XCTAssertFalse(resolver.wantsToPlay)
  }

  func testOnSourceChange_clearsIntent() {
    var resolver = PlayIntentResolver()
    resolver.onPlay()
    resolver.onSourceChange()
    XCTAssertFalse(resolver.wantsToPlay)
  }

  func testOnRelease_clearsIntent() {
    var resolver = PlayIntentResolver()
    resolver.onPlay()
    resolver.onRelease()
    XCTAssertFalse(resolver.wantsToPlay)
  }

  func testFullCycle_play_pause_play_ended() {
    var resolver = PlayIntentResolver()
    resolver.onPlay()
    XCTAssertEqual(resolver.resolve(isPlaying: false), .keepCurrent)

    resolver.onPause()
    XCTAssertEqual(resolver.resolve(isPlaying: false), .paused)

    resolver.onPlay()
    XCTAssertEqual(resolver.resolve(isPlaying: true), .playing)

    resolver.onEnded()
    XCTAssertEqual(resolver.resolve(isPlaying: false), .paused)
  }

  func testSurvivesRebuffer() {
    var resolver = PlayIntentResolver()
    resolver.onPlay()

    // Player starts playing
    XCTAssertEqual(resolver.resolve(isPlaying: true), .playing)

    // Rebuffer stall - isPlaying becomes false
    // wantsToPlay must NOT be cleared by observer callbacks
    XCTAssertEqual(resolver.resolve(isPlaying: false), .keepCurrent,
      "Intent must survive rebuffer - status should not downgrade to paused")

    // Player resumes
    XCTAssertEqual(resolver.resolve(isPlaying: true), .playing)
  }

  func testIsPlaying_alwaysReturnsPlaying_regardlessOfIntent() {
    var resolver = PlayIntentResolver()
    // No intent, but isPlaying true -> should still return playing
    XCTAssertEqual(resolver.resolve(isPlaying: true), .playing)

    resolver.onPlay()
    XCTAssertEqual(resolver.resolve(isPlaying: true), .playing)

    resolver.onPause()
    // Even after pause intent, if player is still technically playing
    XCTAssertEqual(resolver.resolve(isPlaying: true), .playing)
  }
}
