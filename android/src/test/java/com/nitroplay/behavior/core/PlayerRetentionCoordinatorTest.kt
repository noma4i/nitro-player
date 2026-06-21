package com.nitroplay.video.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerRetentionCoordinatorTest {
  private fun snapshot(
    isReleased: Boolean = false,
    hasActiveSource: Boolean = true,
    isPlaying: Boolean = false,
    isAttachedToView: Boolean = false,
    wantsToPlay: Boolean = false,
    isExternalPlaybackActive: Boolean = false,
    isFeedPoolEligible: Boolean = true,
    retentionLevel: PlayerRetentionLevel = PlayerRetentionLevel.HOT
  ) = PlayerRetentionSnapshot(
    isReleased = isReleased,
    hasActiveSource = hasActiveSource,
    isPlaying = isPlaying,
    isAttachedToView = isAttachedToView,
    wantsToPlay = wantsToPlay,
    isExternalPlaybackActive = isExternalPlaybackActive,
    isFeedPoolEligible = isFeedPoolEligible,
    retentionLevel = retentionLevel
  )

  @Test
  fun resourcePressure_trimsIdleActiveSource() {
    assertTrue(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot()))
  }

  @Test
  fun resourcePressure_keepsPinnedPlayers() {
    assertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(isPlaying = true)))
    assertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(isAttachedToView = true)))
    assertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(wantsToPlay = true)))
    assertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(isExternalPlaybackActive = true)))
  }

  @Test
  fun resourcePressure_noopsReleasedOrSourcelessPlayers() {
    assertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(isReleased = true)))
    assertFalse(PlayerRetentionCoordinator.shouldTrimForResourcePressure(snapshot(hasActiveSource = false)))
  }

  @Test
  fun feedHotPool_trimsOnlyEligibleHotUnpinnedPlayers() {
    assertTrue(PlayerRetentionCoordinator.shouldTrimForFeedHotPool(snapshot()))
    assertFalse(PlayerRetentionCoordinator.shouldTrimForFeedHotPool(snapshot(isFeedPoolEligible = false)))
    assertFalse(PlayerRetentionCoordinator.shouldTrimForFeedHotPool(snapshot(retentionLevel = PlayerRetentionLevel.METADATA)))
    assertFalse(PlayerRetentionCoordinator.shouldTrimForFeedHotPool(snapshot(isAttachedToView = true)))
  }

  @Test
  fun feedHotIds_keepsPinnedPlusMostRecentRelaxedPlayers() {
    val players = listOf(
      FeedHotPlayerSnapshot("old", 1, snapshot()),
      FeedHotPlayerSnapshot("new", 3, snapshot()),
      FeedHotPlayerSnapshot("attached", 2, snapshot(isAttachedToView = true)),
      FeedHotPlayerSnapshot("not-feed", 4, snapshot(isFeedPoolEligible = false))
    )

    val keep = PlayerRetentionCoordinator.feedHotIds(players, maxHotPlayers = 2)

    assertEquals(setOf("attached", "new"), keep)
  }
}
