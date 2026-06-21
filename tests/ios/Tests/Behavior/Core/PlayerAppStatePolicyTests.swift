import XCTest
@testable import NitroPlayLogic

final class PlayerAppStatePolicyTests: XCTestCase {
  private func snapshot(
    playInBackground: Bool = false,
    playWhenInactive: Bool = false,
    isPlaying: Bool = true,
    wasAutoPaused: Bool = false,
    isExternalPlaybackActive: Bool = false
  ) -> PlayerAppStateSnapshot {
    PlayerAppStateSnapshot(
      playInBackground: playInBackground,
      playWhenInactive: playWhenInactive,
      isPlaying: isPlaying,
      wasAutoPaused: wasAutoPaused,
      isExternalPlaybackActive: isExternalPlaybackActive
    )
  }

  func testInactiveAutoPauseOnlyForOrdinaryPlayingPlayer() {
    XCTAssertTrue(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot()))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(isPlaying: false)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(playInBackground: true)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(playWhenInactive: true)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(isExternalPlaybackActive: true)))
  }

  func testBackgroundAutoPauseHonorsPlayWhenInactiveAndBackgroundFlags() {
    XCTAssertTrue(PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(snapshot()))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(snapshot(playWhenInactive: true)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(snapshot(playInBackground: true)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(snapshot(isExternalPlaybackActive: true)))
  }

  func testForegroundResumeOnlyForAutoPausedPlayers() {
    XCTAssertFalse(PlayerAppStatePolicy.shouldResumeWhenEnteringForeground(snapshot(wasAutoPaused: false)))
    XCTAssertTrue(PlayerAppStatePolicy.shouldResumeWhenEnteringForeground(snapshot(wasAutoPaused: true)))
  }

  func testBecomeActiveKeepsFailedResumeFlagForRetry() {
    XCTAssertTrue(PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(snapshot(wasAutoPaused: false)))
    XCTAssertTrue(PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(snapshot(isPlaying: true, wasAutoPaused: true)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(snapshot(isPlaying: false, wasAutoPaused: true)))
  }
}
