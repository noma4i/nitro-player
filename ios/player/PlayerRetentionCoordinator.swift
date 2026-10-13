import Foundation

struct PlayerRetentionSnapshot {
  let isReleased: Bool
  let hasActiveSource: Bool
  let isPlaying: Bool
  let isAttachedToView: Bool
  let wantsToPlay: Bool
  let isExternalPlaybackActive: Bool
}

enum PlayerRetentionCoordinator {
  static func isPinnedForResourcePressure(_ snapshot: PlayerRetentionSnapshot) -> Bool {
    guard !snapshot.isReleased, snapshot.hasActiveSource else {
      return false
    }
    return snapshot.isPlaying
      || snapshot.isAttachedToView
      || snapshot.wantsToPlay
      || snapshot.isExternalPlaybackActive
  }

  static func shouldTrimForResourcePressure(_ snapshot: PlayerRetentionSnapshot) -> Bool {
    !snapshot.isReleased
      && snapshot.hasActiveSource
      && !isPinnedForResourcePressure(snapshot)
  }

}
