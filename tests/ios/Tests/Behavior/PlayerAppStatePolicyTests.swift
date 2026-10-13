@testable import NitroPlayPlayerCore
import XCTest

final class PlayerAppStatePolicyTests: XCTestCase {
  private func snapshot(
    playInBackground: Bool = false,
    playWhenInactive: Bool = false,
    isPlaying: Bool = true,
    wasAutoPaused: Bool = false,
    isExternalPlaybackActive: Bool = false,
    wantsToPlay: Bool = true
  ) -> PlayerAppStateSnapshot {
    PlayerAppStateSnapshot(
      playInBackground: playInBackground,
      playWhenInactive: playWhenInactive,
      isPlaying: isPlaying,
      wasAutoPaused: wasAutoPaused,
      isExternalPlaybackActive: isExternalPlaybackActive,
      wantsToPlay: wantsToPlay
    )
  }

  func testInactiveAutoPauseOnlyForOrdinaryPlayingPlayer() {
    XCTAssertTrue(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot()))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(isPlaying: false)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(playInBackground: true)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(playWhenInactive: true)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(isExternalPlaybackActive: true)))
  }

  func testForegroundResumeOnlyForAutoPausedPlayersThatStillWantToPlay() {
    XCTAssertFalse(PlayerAppStatePolicy.shouldResumeWhenEnteringForeground(snapshot(wasAutoPaused: false)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldResumeWhenEnteringForeground(snapshot(wasAutoPaused: true, wantsToPlay: false)))
    XCTAssertTrue(PlayerAppStatePolicy.shouldResumeWhenEnteringForeground(snapshot(wasAutoPaused: true)))
  }

  func testBecomeActiveKeepsFailedResumeFlagForRetry() {
    XCTAssertTrue(PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(snapshot(wasAutoPaused: false)))
    XCTAssertTrue(PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(snapshot(isPlaying: true, wasAutoPaused: true)))
    XCTAssertFalse(PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(snapshot(isPlaying: false, wasAutoPaused: true)))
  }
}
