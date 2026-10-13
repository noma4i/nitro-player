package com.nitroplay.video.player

internal data class PlayerRetentionSnapshot(
  val isReleased: Boolean,
  val hasActiveSource: Boolean,
  val isPlaying: Boolean,
  val isAttachedToView: Boolean,
  val wantsToPlay: Boolean,
  val isExternalPlaybackActive: Boolean
)

internal object PlayerRetentionCoordinator {
  fun isPinnedForResourcePressure(snapshot: PlayerRetentionSnapshot): Boolean {
    if (snapshot.isReleased || !snapshot.hasActiveSource) return false
    return snapshot.isPlaying ||
      snapshot.isAttachedToView ||
      snapshot.wantsToPlay ||
      snapshot.isExternalPlaybackActive
  }

  fun shouldTrimForResourcePressure(snapshot: PlayerRetentionSnapshot): Boolean {
    return !snapshot.isReleased &&
      snapshot.hasActiveSource &&
      !isPinnedForResourcePressure(snapshot)
  }

}
