package com.nitroplay.video.player

internal data class PlayerAppStateSnapshot(
  val playInBackground: Boolean,
  val playWhenInactive: Boolean,
  val isPlaying: Boolean,
  val wasAutoPaused: Boolean,
  val isExternalPlaybackActive: Boolean,
  val wantsToPlay: Boolean
)

internal object PlayerAppStatePolicy {
  fun shouldAutoPauseWhenInactive(snapshot: PlayerAppStateSnapshot): Boolean {
    return snapshot.isPlaying &&
      !snapshot.playInBackground &&
      !snapshot.playWhenInactive &&
      !snapshot.isExternalPlaybackActive
  }

  fun shouldAutoPauseWhenEnteringBackground(snapshot: PlayerAppStateSnapshot): Boolean {
    return shouldAutoPauseWhenInactive(snapshot)
  }

  // resume only when the player itself still wants to play; JS-managed players are resumed by the JS arbiter.
  fun shouldResumeWhenEnteringForeground(snapshot: PlayerAppStateSnapshot): Boolean {
    return snapshot.wasAutoPaused && snapshot.wantsToPlay
  }

  fun shouldClearAutoPausedAfterBecomeActive(snapshot: PlayerAppStateSnapshot): Boolean {
    return !snapshot.wasAutoPaused || snapshot.isPlaying
  }
}
