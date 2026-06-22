package com.nitroplay.video.behavior.playback

import com.margelo.nitro.video.NitroPlayerStatus
import com.margelo.nitro.video.PlaybackState
import com.margelo.nitro.video.PlaybackStateEmissionGate
import com.margelo.nitro.video.PlaybackStateFingerprint
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackEmitGateTest {
  @Test
  fun suppressesRepeatedMeaningfulStateFingerprint() {
    val gate = PlaybackStateEmissionGate()
    val fingerprint = makeFingerprint(status = NitroPlayerStatus.PLAYING, currentTime = 10.0)

    assertTrue(gate.shouldEmit(fingerprint))
    assertFalse(gate.shouldEmit(fingerprint))
    assertFalse(gate.shouldEmit(fingerprint))
  }

  @Test
  fun emitsWhenMeaningfulStateFingerprintChanges() {
    val gate = PlaybackStateEmissionGate()

    assertTrue(gate.shouldEmit(makeFingerprint(status = NitroPlayerStatus.PAUSED, currentTime = 10.0)))
    assertTrue(gate.shouldEmit(makeFingerprint(status = NitroPlayerStatus.PLAYING, currentTime = 10.0)))
    assertTrue(gate.shouldEmit(makeFingerprint(status = NitroPlayerStatus.PLAYING, currentTime = 11.0)))
  }

  @Test
  fun resetAllowsNextFingerprintToEmitAgain() {
    val gate = PlaybackStateEmissionGate()
    val fingerprint = makeFingerprint(status = NitroPlayerStatus.PAUSED, currentTime = 10.0)

    assertTrue(gate.shouldEmit(fingerprint))
    assertFalse(gate.shouldEmit(fingerprint))

    gate.reset()

    assertTrue(gate.shouldEmit(fingerprint))
  }

  @Test
  fun nanFieldsAreStableForDeduping() {
    val gate = PlaybackStateEmissionGate()
    val fingerprint = makeFingerprint(status = NitroPlayerStatus.LOADING, currentTime = Double.NaN, duration = Double.NaN)

    assertTrue(gate.shouldEmit(fingerprint))
    assertFalse(gate.shouldEmit(makeFingerprint(status = NitroPlayerStatus.LOADING, currentTime = Double.NaN, duration = Double.NaN)))
  }

  @Test
  fun concurrentCallersDoNotRaceSharedState() {
    val gate = PlaybackStateEmissionGate()
    val iterations = 1000
    val executor = Executors.newFixedThreadPool(8)
    val latch = CountDownLatch(iterations)

    repeat(iterations) { index ->
      executor.execute {
        gate.shouldEmit(makeFingerprint(status = NitroPlayerStatus.entries[index % NitroPlayerStatus.entries.size], currentTime = (index % 5).toDouble()))
        latch.countDown()
      }
    }

    assertTrue(latch.await(5, TimeUnit.SECONDS))
    executor.shutdownNow()
  }

  @Test
  fun fromValuesMatchesFingerprintBuiltFromState() {
    val state = PlaybackState(
      status = NitroPlayerStatus.PLAYING,
      currentTime = 10.0,
      duration = 12.0,
      bufferDuration = 2.0,
      bufferedPosition = 12.0,
      rate = 1.0,
      isPlaying = true,
      isBuffering = false,
      isVisualReady = true,
      error = null,
      nativeTimestampMs = 999.0
    )

    val fromState = PlaybackStateFingerprint.from(state)
    val fromValues = PlaybackStateFingerprint.fromValues(
      NitroPlayerStatus.PLAYING, 10.0, 12.0, 2.0, 12.0, 1.0,
      true, false, true, null
    )

    assertEquals(fromState, fromValues)
  }

  private fun makeFingerprint(
    status: NitroPlayerStatus,
    currentTime: Double = 0.0,
    duration: Double = 12.0,
    bufferDuration: Double = 2.0,
    bufferedPosition: Double = 2.0,
    rate: Double = 1.0,
    isPlaying: Boolean = false,
    isBuffering: Boolean = false,
    isVisualReady: Boolean = false
  ): PlaybackStateFingerprint {
    return PlaybackStateFingerprint(
      status = status,
      currentTimeBits = currentTime.toBits(),
      durationBits = duration.toBits(),
      bufferDurationBits = bufferDuration.toBits(),
      bufferedPositionBits = bufferedPosition.toBits(),
      rateBits = rate.toBits(),
      isPlaying = isPlaying,
      isBuffering = isBuffering,
      isVisualReady = isVisualReady,
      errorCode = null,
      errorMessageHash = null
    )
  }
}
