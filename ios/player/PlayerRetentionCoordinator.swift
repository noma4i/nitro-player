import Foundation

enum PlayerRetentionLevel {
  case cold
  case metadata
  case hot
}

struct PlayerRetentionSnapshot {
  let isReleased: Bool
  let hasActiveSource: Bool
  let isPlaying: Bool
  let isAttachedToView: Bool
  let wantsToPlay: Bool
  let isExternalPlaybackActive: Bool
  let isFeedPoolEligible: Bool
  let retentionLevel: PlayerRetentionLevel
}

struct FeedHotPlayerSnapshot<ID: Hashable> {
  let id: ID
  let activity: UInt64
  let retention: PlayerRetentionSnapshot
}

enum PlayerRetentionCoordinator {
  static func isPinnedForFeedPool(_ snapshot: PlayerRetentionSnapshot) -> Bool {
    guard !snapshot.isReleased, snapshot.hasActiveSource else {
      return false
    }
    return snapshot.isPlaying
      || snapshot.isAttachedToView
      || snapshot.wantsToPlay
      || snapshot.isExternalPlaybackActive
  }

  static func isPinnedForResourcePressure(_ snapshot: PlayerRetentionSnapshot) -> Bool {
    guard !snapshot.isReleased, snapshot.hasActiveSource else {
      return false
    }
    return snapshot.isPlaying
      || snapshot.isAttachedToView
      || snapshot.wantsToPlay
      || snapshot.isExternalPlaybackActive
  }

  static func shouldTrimForFeedHotPool(_ snapshot: PlayerRetentionSnapshot) -> Bool {
    !snapshot.isReleased
      && snapshot.hasActiveSource
      && snapshot.isFeedPoolEligible
      && snapshot.retentionLevel == .hot
      && !isPinnedForFeedPool(snapshot)
  }

  static func shouldTrimForResourcePressure(_ snapshot: PlayerRetentionSnapshot) -> Bool {
    !snapshot.isReleased
      && snapshot.hasActiveSource
      && !isPinnedForResourcePressure(snapshot)
  }

  static func feedHotIds<ID: Hashable>(
    players: [FeedHotPlayerSnapshot<ID>],
    maxHotPlayers: Int
  ) -> Set<ID> {
    let eligible = players.filter { $0.retention.hasActiveSource && $0.retention.isFeedPoolEligible }
    guard !eligible.isEmpty else {
      return []
    }

    let pinned = eligible
      .filter { isPinnedForFeedPool($0.retention) }
      .sorted { $0.activity > $1.activity }

    let relaxed = eligible
      .filter { !isPinnedForFeedPool($0.retention) }
      .sorted { $0.activity > $1.activity }

    var keep = Set(pinned.map(\.id))
    let extraHotSlots = max(0, maxHotPlayers - keep.count)
    for player in relaxed.prefix(extraHotSlots) {
      keep.insert(player.id)
    }
    return keep
  }
}
