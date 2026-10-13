package com.nitroplay.video.behavior.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import com.nitroplay.video.player.PlayerRetentionCoordinator
import com.nitroplay.video.player.PlayerRetentionSnapshot

class PlayerRetentionCoordinatorTest {
  private fun snapshot(
    isReleased: Boolean = false,
    hasActiveSource: Boolean = true,
    isPlaying: Boolean = false,
    isAttachedToView: Boolean = false,
    wantsToPlay: Boolean = false,
    isExternalPlaybackActive: Boolean = false
  ) = PlayerRetentionSnapshot(
    isReleased = isReleased,
    hasActiveSource = hasActiveSource,
    isPlaying = isPlaying,
    isAttachedToView = isAttachedToView,
    wantsToPlay = wantsToPlay,
    isExternalPlaybackActive = isExternalPlaybackActive
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
}
