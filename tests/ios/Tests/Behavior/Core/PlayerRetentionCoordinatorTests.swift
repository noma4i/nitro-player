import XCTest
@testable import NitroPlayLogic

final class PlayerRetentionCoordinatorTests: XCTestCase {
  private func snapshot(
    isReleased: Bool = false,
    hasActiveSource: Bool = true,
    isPlaying: Bool = false,
    isAttachedToView: Bool = false,
    wantsToPlay: Bool = false,
    isExternalPlaybackActive: Bool = false,
    isFeedPoolEligible: Bool = true,
    retentionLevel: PlayerRetentionLevel = .hot
  ) -> PlayerRetentionSnapshot {
    PlayerRetentionSnapshot(
      isReleased: isReleased,
      hasActiveSource: hasActiveSource,
      isPlaying: isPlaying,
      isAttachedToView: isAttachedToView,
      wantsToPlay: wantsToPlay,
      isExternalPlaybackActive: isExternalPlaybackActive,
      isFeedPoolEligible: isFeedPoolEligible,
      retentionLevel: retentionLevel
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

  func testFeedHotPoolTrimsOnlyEligibleHotUnpinnedPlayers() {
    XCTAssertTrue(PlayerRetentionCoordinator.shouldTrimForFeedHotPool(snapshot()))
    XCTAssertFalse(PlayerRetentionCoordinator.shouldTrimForFeedHotPool(snapshot(isFeedPoolEligible: false)))
    XCTAssertFalse(PlayerRetentionCoordinator.shouldTrimForFeedHotPool(snapshot(retentionLevel: .metadata)))
    XCTAssertFalse(PlayerRetentionCoordinator.shouldTrimForFeedHotPool(snapshot(isAttachedToView: true)))
  }

  func testFeedHotIdsKeepsPinnedPlusMostRecentRelaxedPlayers() {
    let players = [
      FeedHotPlayerSnapshot(id: "old", activity: 1, retention: snapshot()),
      FeedHotPlayerSnapshot(id: "new", activity: 3, retention: snapshot()),
      FeedHotPlayerSnapshot(id: "attached", activity: 2, retention: snapshot(isAttachedToView: true)),
      FeedHotPlayerSnapshot(id: "not-feed", activity: 4, retention: snapshot(isFeedPoolEligible: false))
    ]

    let keep = PlayerRetentionCoordinator.feedHotIds(players: players, maxHotPlayers: 2)

    XCTAssertEqual(keep, Set(["attached", "new"]))
  }
}
