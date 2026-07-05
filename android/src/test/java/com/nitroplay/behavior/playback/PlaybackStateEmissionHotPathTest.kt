package com.nitroplay.video.behavior.playback

import com.margelo.nitro.video.HybridNitroPlayerEventEmitter
import com.margelo.nitro.video.NitroPlayerStatus
import com.margelo.nitro.video.PlaybackState
import com.margelo.nitro.video.PlaybackStateEmissionCoordinator
import com.margelo.nitro.video.PlaybackStateEmissionGate
import com.margelo.nitro.video.PlaybackStateFingerprint
import com.nitroplay.video.support.ListenerRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.LooperMode

@RunWith(RobolectricTestRunner::class)
@LooperMode(LooperMode.Mode.PAUSED)
class PlaybackStateEmissionHotPathTest {
  @Test
  fun noPlaybackStateListenerSkipsSnapshotWork() {
    val registry = ListenerRegistry()
    var didBuildSnapshot = false

    if (PlaybackStateEmissionCoordinator.shouldBuildSnapshot(
        canEmitForLifecycle = true,
        hasPlaybackStateListeners = registry.hasListeners("onPlaybackState")
      )
    ) {
      didBuildSnapshot = true
    }

    assertFalse(didBuildSnapshot)

    registry.add<(PlaybackState) -> Unit>("onPlaybackState") { _: PlaybackState -> }

    assertTrue(
      PlaybackStateEmissionCoordinator.shouldBuildSnapshot(
        canEmitForLifecycle = true,
        hasPlaybackStateListeners = registry.hasListeners("onPlaybackState")
      )
    )
  }

  @Test
  fun playbackStateSubscriptionResetsGateForNextTick() {
    val gate = PlaybackStateEmissionGate()
    val emitter = HybridNitroPlayerEventEmitter()
    val fingerprint = makeFingerprint()

    assertTrue(gate.shouldEmit(fingerprint))
    assertFalse(gate.shouldEmit(fingerprint))

    emitter.onPlaybackStateListenerAdded = {
      gate.reset()
    }
    emitter.addOnPlaybackStateListener { }

    assertTrue(gate.shouldEmit(fingerprint))
  }

  private fun makeFingerprint(): PlaybackStateFingerprint {
    return PlaybackStateFingerprint(
      status = NitroPlayerStatus.PLAYING,
      currentTimeBits = 1.0.toBits(),
      durationBits = 10.0.toBits(),
      bufferDurationBits = 2.0.toBits(),
      bufferedPositionBits = 3.0.toBits(),
      rateBits = 1.0.toBits(),
      isPlaying = true,
      isBuffering = false,
      isVisualReady = true,
      errorCode = null,
      errorMessageHash = null
    )
  }
}
