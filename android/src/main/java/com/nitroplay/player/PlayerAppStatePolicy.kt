package com.nitroplay.video.core

internal data class PlayerAppStateSnapshot(
  val playInBackground: Boolean,
  val playWhenInactive: Boolean,
  val isPlaying: Boolean,
  val wasAutoPaused: Boolean,
  val isExternalPlaybackActive: Boolean
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

  fun shouldResumeWhenEnteringForeground(snapshot: PlayerAppStateSnapshot): Boolean {
    return snapshot.wasAutoPaused
  }

  fun shouldClearAutoPausedAfterBecomeActive(snapshot: PlayerAppStateSnapshot): Boolean {
    return !snapshot.wasAutoPaused || snapshot.isPlaying
  }
}
