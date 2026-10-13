@testable import NitroPlayPlayerCore
import XCTest

final class PlayerRetentionCoordinatorTests: XCTestCase {
  private func snapshot(
    isReleased: Bool = false,
    hasActiveSource: Bool = true,
    isPlaying: Bool = false,
    isAttachedToView: Bool = false,
    wantsToPlay: Bool = false,
    isExternalPlaybackActive: Bool = false
  ) -> PlayerRetentionSnapshot {
    PlayerRetentionSnapshot(
      isReleased: isReleased,
      hasActiveSource: hasActiveSource,
      isPlaying: isPlaying,
      isAttachedToView: isAttachedToView,
      wantsToPlay: wantsToPlay,
      isExternalPlaybackActive: isExternalPlaybackActive
    )
  }

  func testResourcePressureTrimsIdleActiveSource() {
    XCTAssertTrue(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot()))
  }

  func testResourcePressureKeepsPinnedPlayers() {
    XCTAssertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(isPlaying: true)))
    XCTAssertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(isAttachedToView: true)))
    XCTAssertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(wantsToPlay: true)))
    XCTAssertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(isExternalPlaybackActive: true)))
  }

  func testResourcePressureNoopsReleasedOrSourcelessPlayers() {
    XCTAssertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(isReleased: true)))
    XCTAssertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(hasActiveSource: false)))
  }
}
