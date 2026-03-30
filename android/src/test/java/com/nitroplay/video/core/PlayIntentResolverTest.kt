package com.nitroplay.video.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayIntentResolverTest {

  @Test
  fun resolve_isPlaying_returnsPlaying() {
    val resolver = PlayIntentResolver()
    assertEquals(PlayPauseResolution.PLAYING, resolver.resolve(isPlaying = true))
  }

  @Test
  fun resolve_notPlaying_wantsToPlay_returnsKeepCurrent() {
    val resolver = PlayIntentResolver()
    resolver.onPlay()
    assertEquals(PlayPauseResolution.KEEP_CURRENT, resolver.resolve(isPlaying = false))
  }

  @Test
  fun resolve_notPlaying_noIntent_returnsPaused() {
    val resolver = PlayIntentResolver()
    assertEquals(PlayPauseResolution.PAUSED, resolver.resolve(isPlaying = false))
  }

  @Test
  fun onPlay_setsIntent() {
    val resolver = PlayIntentResolver()
    assertFalse(resolver.wantsToPlay)
    resolver.onPlay()
    assertTrue(resolver.wantsToPlay)
  }

  @Test
  fun onPause_clearsIntent() {
    val resolver = PlayIntentResolver()
    resolver.onPlay()
    resolver.onPause()
    assertFalse(resolver.wantsToPlay)
  }

  @Test
  fun onEnded_clearsIntent() {
    val resolver = PlayIntentResolver()
    resolver.onPlay()
    resolver.onEnded()
    assertFalse(resolver.wantsToPlay)
  }

  @Test
  fun onError_clearsIntent() {
    val resolver = PlayIntentResolver()
    resolver.onPlay()
    resolver.onError()
    assertFalse(resolver.wantsToPlay)
  }

  @Test
  fun onSourceChange_clearsIntent() {
    val resolver = PlayIntentResolver()
    resolver.onPlay()
    resolver.onSourceChange()
    assertFalse(resolver.wantsToPlay)
  }

  @Test
  fun onRelease_clearsIntent() {
    val resolver = PlayIntentResolver()
    resolver.onPlay()
    resolver.onRelease()
    assertFalse(resolver.wantsToPlay)
  }

  @Test
  fun fullCycle_play_pause_play_ended() {
    val resolver = PlayIntentResolver()
    resolver.onPlay()
    assertEquals(PlayPauseResolution.KEEP_CURRENT, resolver.resolve(false))

    resolver.onPause()
    assertEquals(PlayPauseResolution.PAUSED, resolver.resolve(false))

    resolver.onPlay()
    assertEquals(PlayPauseResolution.PLAYING, resolver.resolve(true))

    resolver.onEnded()
    assertEquals(PlayPauseResolution.PAUSED, resolver.resolve(false))
  }

  @Test
  fun survivesRebuffer() {
    val resolver = PlayIntentResolver()
    resolver.onPlay()

    assertEquals(PlayPauseResolution.PLAYING, resolver.resolve(true))
    // Rebuffer stall
    assertEquals(PlayPauseResolution.KEEP_CURRENT, resolver.resolve(false))
    // Resume
    assertEquals(PlayPauseResolution.PLAYING, resolver.resolve(true))
  }

  @Test
  fun isPlaying_alwaysReturnsPlaying_regardlessOfIntent() {
    val resolver = PlayIntentResolver()
    assertEquals(PlayPauseResolution.PLAYING, resolver.resolve(true))

    resolver.onPlay()
    assertEquals(PlayPauseResolution.PLAYING, resolver.resolve(true))

    resolver.onPause()
    assertEquals(PlayPauseResolution.PLAYING, resolver.resolve(true))
  }
}
