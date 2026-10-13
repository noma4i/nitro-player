import Foundation

struct PlayerAppStateSnapshot {
  let playInBackground: Bool
  let playWhenInactive: Bool
  let isPlaying: Bool
  let wasAutoPaused: Bool
  let isExternalPlaybackActive: Bool
  let wantsToPlay: Bool
}

enum PlayerAppStatePolicy {
  static func shouldAutoPauseWhenInactive(_ snapshot: PlayerAppStateSnapshot) -> Bool {
    snapshot.isPlaying
      && !snapshot.playInBackground
      && !snapshot.playWhenInactive
      && !snapshot.isExternalPlaybackActive
  }

  static func shouldAutoPauseWhenEnteringBackground(_ snapshot: PlayerAppStateSnapshot) -> Bool {
    shouldAutoPauseWhenInactive(snapshot)
  }

  // resume only when the player itself still wants to play; JS-managed players are resumed by the JS arbiter.
  static func shouldResumeWhenEnteringForeground(_ snapshot: PlayerAppStateSnapshot) -> Bool {
    snapshot.wasAutoPaused && snapshot.wantsToPlay
  }

  static func shouldClearAutoPausedAfterBecomeActive(_ snapshot: PlayerAppStateSnapshot) -> Bool {
    !snapshot.wasAutoPaused || snapshot.isPlaying
  }
}
