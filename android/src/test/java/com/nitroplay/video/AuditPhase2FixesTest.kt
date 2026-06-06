package com.nitroplay.video

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Behavior tests for Phase 2 audit fixes whose production code lives in
 * JNI-bound hybrids/views that cannot be instantiated under plain JUnit. Each
 * test mirrors the exact decision logic of the referenced production code
 * (same convention as AuditPhase1FixesTest / NitroPlayerManagerBehaviorTest).
 */
class AuditPhase2FixesTest {

  // -- NP-THREAD-05: muted setter caches the pre-duck volume, not the live one.
  // Mirrors HybridNitroPlayer.muted setter + AudioFocusManager.preDuckVolume:
  // while audio focus is ducking, player.volume is 0.5x, so caching the live
  // value would make unmute restore the ducked level.

  private class MuteModel(var playerVolume: Float, var preDuckVolume: Float?) {
    var userVolume: Float = playerVolume
    var cachedMuted = false

    fun setMuted(value: Boolean) {
      if (value) {
        if (!cachedMuted) {
          userVolume = preDuckVolume ?: playerVolume
        }
        playerVolume = 0f
      } else {
        playerVolume = userVolume
      }
      cachedMuted = value
    }
  }

  @Test
  fun muted_whileDucked_unmuteRestoresPreDuckVolume() {
    // User volume was 1.0; audio focus ducked the live player down to 0.5.
    val model = MuteModel(playerVolume = 0.5f, preDuckVolume = 1.0f)

    model.setMuted(true)
    assertEquals(0f, model.playerVolume, 0f)
    assertEquals("Cached the pre-duck volume, not the ducked live one", 1.0f, model.userVolume, 0f)

    model.setMuted(false)
    assertEquals("Unmute restores the user's real volume, not the ducked level", 1.0f, model.playerVolume, 0f)
  }

  @Test
  fun muted_whenNotDucked_usesLiveVolume() {
    val model = MuteModel(playerVolume = 0.8f, preDuckVolume = null)

    model.setMuted(true)
    assertEquals(0.8f, model.userVolume, 0f)

    model.setMuted(false)
    assertEquals(0.8f, model.playerVolume, 0f)
  }

  @Test
  fun muted_repeatedMute_doesNotOverwriteCachedVolume() {
    val model = MuteModel(playerVolume = 0.5f, preDuckVolume = 1.0f)
    model.setMuted(true)
    // A second mute while already muted (pre-duck gone) must not clobber userVolume.
    model.preDuckVolume = null
    model.playerVolume = 0f
    model.setMuted(true)
    assertEquals(1.0f, model.userVolume, 0f)
  }

  // -- NP-LIFECYCLE-10 / NP-MEMORY-04: fullscreen restore() guards a destroyed
  // activity and dismiss() always tears down the dialog even if restore throws.
  // Mirrors FullscreenDialogManager.restore()/dismiss().

  private class DialogModel(var activityDestroyed: Boolean, var restoreThrows: Boolean) {
    var dialog: Any? = Any()
    var isActive = true
    var reparentedToHost = false

    fun restore() {
      if (activityDestroyed) {
        isActive = false
        return
      }
      if (restoreThrows) {
        throw IllegalStateException("removeView failed")
      }
      reparentedToHost = true
      isActive = false
    }

    fun dismiss() {
      try {
        if (isActive) {
          restore()
        }
      } finally {
        dialog = null
      }
    }
  }

  @Test
  fun restore_onDestroyedActivity_bailsWithoutReparenting() {
    val model = DialogModel(activityDestroyed = true, restoreThrows = false)
    model.restore()
    assertFalse(model.reparentedToHost)
    assertFalse(model.isActive)
  }

  @Test
  fun dismiss_alwaysClearsDialog_evenWhenRestoreThrows() {
    val model = DialogModel(activityDestroyed = false, restoreThrows = true)
    try {
      model.dismiss()
    } catch (_: Exception) {
      // restore() propagates, but the finally must still null the dialog.
    }
    assertNull("dialog must be released even if restore() throws", model.dialog)
  }

  // -- NP-PERF-01: emitPlaybackState skips emit when the state is unchanged
  // (ignoring nativeTimestampMs). Mirrors the equality gate added to
  // emitPlaybackState() on both platforms.

  private data class StateModel(val position: Int, val isPlaying: Boolean, val timestamp: Long)

  private class EmitGate {
    private var last: StateModel? = null
    var emitCount = 0

    fun emit(state: StateModel) {
      val prev = last
      if (prev != null && prev.copy(timestamp = 0L) == state.copy(timestamp = 0L)) {
        return
      }
      last = state
      emitCount += 1
    }
  }

  @Test
  fun emitGate_suppressesIdenticalStatesAcrossTicks() {
    val gate = EmitGate()
    gate.emit(StateModel(position = 10, isPlaying = false, timestamp = 1000))
    gate.emit(StateModel(position = 10, isPlaying = false, timestamp = 1250)) // paused tick
    gate.emit(StateModel(position = 10, isPlaying = false, timestamp = 1500)) // paused tick
    assertEquals(1, gate.emitCount)
  }

  @Test
  fun emitGate_emitsWhenAnyMeaningfulFieldChanges() {
    val gate = EmitGate()
    gate.emit(StateModel(position = 10, isPlaying = false, timestamp = 1000))
    gate.emit(StateModel(position = 11, isPlaying = false, timestamp = 1250)) // progressed
    gate.emit(StateModel(position = 11, isPlaying = true, timestamp = 1500)) // resumed
    assertEquals(3, gate.emitCount)
    assertTrue(gate.emitCount > 1)
  }
}
