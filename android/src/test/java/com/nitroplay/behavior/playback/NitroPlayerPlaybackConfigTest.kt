package com.nitroplay.video.behavior.playback

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.upstream.DefaultAllocator
import androidx.test.core.app.ApplicationProvider
import com.margelo.nitro.video.BufferConfig
import com.margelo.nitro.video.NitroPlayerLoadControlConfig
import com.margelo.nitro.video.NitroPlayerPlaybackConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(UnstableApi::class)
@RunWith(RobolectricTestRunner::class)
class NitroPlayerPlaybackConfigTest {
  private val context = ApplicationProvider.getApplicationContext<Context>()

  @Test
  fun absentBufferConfigUsesDocumentedAndroidDefaults() {
    val config = NitroPlayerPlaybackConfig.from(null)

    assertEquals(
      NitroPlayerLoadControlConfig(
        minBufferMs = 5000,
        maxBufferMs = 10000,
        bufferForPlaybackMs = 1000,
        bufferForPlaybackAfterRebufferMs = 2000,
        backBufferDurationMs = 0
      ),
      config.loadControl
    )
    assertNull(config.preferredPeakBitRate)
  }

  @Test
  fun bufferConfigMapsToLoadControlBuilderValues() {
    val config = NitroPlayerPlaybackConfig.from(
      bufferConfig(
        minBufferMs = 7000.0,
        maxBufferMs = 15000.0,
        bufferForPlaybackMs = 1200.0,
        bufferForPlaybackAfterRebufferMs = 2600.0,
        backBufferDurationMs = 3000.0
      )
    )
    val loadControl = config.createLoadControl(DefaultAllocator(true, 64 * 1024))

    assertEquals(7000, config.loadControl.minBufferMs)
    assertEquals(15000, config.loadControl.maxBufferMs)
    assertEquals(1200, config.loadControl.bufferForPlaybackMs)
    assertEquals(2600, config.loadControl.bufferForPlaybackAfterRebufferMs)
    assertEquals(3000, config.loadControl.backBufferDurationMs)
    assertEquals(7_000_000L, loadControl.longField("minBufferUs"))
    assertEquals(15_000_000L, loadControl.longField("maxBufferUs"))
    assertEquals(1_200_000L, loadControl.longField("bufferForPlaybackUs"))
    assertEquals(2_600_000L, loadControl.longField("bufferForPlaybackAfterRebufferUs"))
    assertEquals(3_000_000L, loadControl.longField("backBufferDurationUs"))
  }

  @Test
  fun initialPlayerBuildUsesSourceLoadControlConfig() {
    val config = NitroPlayerPlaybackConfig.from(
      bufferConfig(
        minBufferMs = 6500.0,
        maxBufferMs = 14000.0,
        bufferForPlaybackMs = 900.0,
        bufferForPlaybackAfterRebufferMs = 1900.0,
        backBufferDurationMs = 500.0
      )
    )

    assertTrue(config.requiresPlayerRebuild(null))
    assertEquals(6500, config.loadControl.minBufferMs)
    assertEquals(14000, config.loadControl.maxBufferMs)
    assertEquals(900, config.loadControl.bufferForPlaybackMs)
    assertEquals(1900, config.loadControl.bufferForPlaybackAfterRebufferMs)
    assertEquals(500, config.loadControl.backBufferDurationMs)
  }

  @Test
  fun bitrateOnlyChangeReusesPlayerAndAppliesTrackSelectorCap() {
    val first = NitroPlayerPlaybackConfig.from(
      bufferConfig(minBufferMs = 6500.0, preferredPeakBitRate = 6_000_000.0)
    )
    val second = NitroPlayerPlaybackConfig.from(
      bufferConfig(minBufferMs = 6500.0, preferredPeakBitRate = 3_500_000.0)
    )
    val selector = first.createTrackSelector(context)

    assertFalse(second.requiresPlayerRebuild(first))
    second.applyToTrackSelector(selector)
    assertEquals(3_500_000, selector.parameters.maxVideoBitrate)
  }

  @Test
  fun missingBitrateClearsTrackSelectorCapForReusedPlayer() {
    val selector = DefaultTrackSelector(context)
    NitroPlayerPlaybackConfig.from(bufferConfig(preferredPeakBitRate = 6_000_000.0))
      .applyToTrackSelector(selector)
    assertEquals(6_000_000, selector.parameters.maxVideoBitrate)

    NitroPlayerPlaybackConfig.from(null).applyToTrackSelector(selector)

    assertEquals(Int.MAX_VALUE, selector.parameters.maxVideoBitrate)
  }

  private fun bufferConfig(
    minBufferMs: Double? = null,
    maxBufferMs: Double? = null,
    bufferForPlaybackMs: Double? = null,
    bufferForPlaybackAfterRebufferMs: Double? = null,
    backBufferDurationMs: Double? = null,
    preferredPeakBitRate: Double? = null
  ): BufferConfig {
    return BufferConfig(
      livePlayback = null,
      minBufferMs = minBufferMs,
      maxBufferMs = maxBufferMs,
      bufferForPlaybackMs = bufferForPlaybackMs,
      bufferForPlaybackAfterRebufferMs = bufferForPlaybackAfterRebufferMs,
      backBufferDurationMs = backBufferDurationMs,
      preferredForwardBufferDurationMs = null,
      preferredPeakBitRate = preferredPeakBitRate,
      preferredMaximumResolution = null,
      preferredPeakBitRateForExpensiveNetworks = null,
      preferredMaximumResolutionForExpensiveNetworks = null
    )
  }

  private fun DefaultLoadControl.longField(name: String): Long {
    val field = DefaultLoadControl::class.java.getDeclaredField(name)
    field.isAccessible = true
    return field.getLong(this)
  }
}
