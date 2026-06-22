package com.nitroplay.video.player

internal enum class PlayerRetentionLevel {
  COLD,
  METADATA,
  HOT
}

internal data class PlayerRetentionSnapshot(
  val isReleased: Boolean,
  val hasActiveSource: Boolean,
  val isPlaying: Boolean,
  val isAttachedToView: Boolean,
  val wantsToPlay: Boolean,
  val isExternalPlaybackActive: Boolean,
  val isFeedPoolEligible: Boolean,
  val retentionLevel: PlayerRetentionLevel
)

internal data class FeedHotPlayerSnapshot<ID>(
  val id: ID,
  val activity: Long,
  val retention: PlayerRetentionSnapshot
)

internal object PlayerRetentionCoordinator {
  fun isPinnedForFeedPool(snapshot: PlayerRetentionSnapshot): Boolean {
    if (snapshot.isReleased || !snapshot.hasActiveSource) return false
    return snapshot.isPlaying ||
      snapshot.isAttachedToView ||
      snapshot.wantsToPlay ||
      snapshot.isExternalPlaybackActive
  }

  fun isPinnedForResourcePressure(snapshot: PlayerRetentionSnapshot): Boolean {
    if (snapshot.isReleased || !snapshot.hasActiveSource) return false
    return snapshot.isPlaying ||
      snapshot.isAttachedToView ||
      snapshot.wantsToPlay ||
      snapshot.isExternalPlaybackActive
  }

  fun shouldTrimForFeedHotPool(snapshot: PlayerRetentionSnapshot): Boolean {
    return !snapshot.isReleased &&
      snapshot.hasActiveSource &&
      snapshot.isFeedPoolEligible &&
      snapshot.retentionLevel == PlayerRetentionLevel.HOT &&
      !isPinnedForFeedPool(snapshot)
  }

  fun shouldTrimForResourcePressure(snapshot: PlayerRetentionSnapshot): Boolean {
    return !snapshot.isReleased &&
      snapshot.hasActiveSource &&
      !isPinnedForResourcePressure(snapshot)
  }

  fun <ID> feedHotIds(
    players: List<FeedHotPlayerSnapshot<ID>>,
    maxHotPlayers: Int
  ): Set<ID> {
    val eligible = players.filter {
      it.retention.hasActiveSource && it.retention.isFeedPoolEligible
    }
    if (eligible.isEmpty()) return emptySet()

    val pinned = eligible
      .filter { isPinnedForFeedPool(it.retention) }
      .sortedByDescending { it.activity }

    val relaxed = eligible
      .filterNot { isPinnedForFeedPool(it.retention) }
      .sortedByDescending { it.activity }

    val keep = linkedSetOf<ID>()
    keep.addAll(pinned.map { it.id })

    val extraHotSlots = (maxHotPlayers - keep.size).coerceAtLeast(0)
    relaxed.take(extraHotSlots).forEach { keep.add(it.id) }
    return keep
  }
}
