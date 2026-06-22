package com.nitroplay.video.behavior.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import com.nitroplay.video.player.PlayerAppStatePolicy
import com.nitroplay.video.player.PlayerAppStateSnapshot

class PlayerAppStatePolicyTest {
  private fun snapshot(
    playInBackground: Boolean = false,
    playWhenInactive: Boolean = false,
    isPlaying: Boolean = true,
    wasAutoPaused: Boolean = false,
    isExternalPlaybackActive: Boolean = false
  ) = PlayerAppStateSnapshot(
    playInBackground = playInBackground,
    playWhenInactive = playWhenInactive,
    isPlaying = isPlaying,
    wasAutoPaused = wasAutoPaused,
    isExternalPlaybackActive = isExternalPlaybackActive
  )

  @Test
  fun inactiveAutoPauseOnlyForOrdinaryPlayingPlayer() {
    assertTrue(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot()))
    assertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(isPlaying = false)))
    assertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(playInBackground = true)))
    assertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(playWhenInactive = true)))
    assertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenInactive(snapshot(isExternalPlaybackActive = true)))
  }

  @Test
  fun backgroundAutoPauseHonorsPlayWhenInactiveAndBackgroundFlags() {
    assertTrue(PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(snapshot()))
    assertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(snapshot(playWhenInactive = true)))
    assertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(snapshot(playInBackground = true)))
    assertFalse(PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(snapshot(isExternalPlaybackActive = true)))
  }

  @Test
  fun foregroundResumeOnlyForAutoPausedPlayers() {
    assertFalse(PlayerAppStatePolicy.shouldResumeWhenEnteringForeground(snapshot(wasAutoPaused = false)))
    assertTrue(PlayerAppStatePolicy.shouldResumeWhenEnteringForeground(snapshot(wasAutoPaused = true)))
  }

  @Test
  fun becomeActiveKeepsFailedResumeFlagForRetry() {
    assertTrue(PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(snapshot(wasAutoPaused = false)))
    assertTrue(PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(snapshot(isPlaying = true, wasAutoPaused = true)))
    assertFalse(PlayerAppStatePolicy.shouldClearAutoPausedAfterBecomeActive(snapshot(isPlaying = false, wasAutoPaused = true)))
  }
}
