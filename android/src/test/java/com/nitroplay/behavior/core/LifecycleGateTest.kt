package com.nitroplay.video.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Exercises the real production lifecycle seam (LifecycleGate) that
// HybridNitroPlayer forwards isReleased / sourceGeneration to. iOS/Android parity
// with LifecycleGateTests.swift.
class LifecycleGateTest {
  @Test
  fun initialState_notReleased_generationZero() {
    val gate = LifecycleGate()
    assertFalse(gate.isReleased)
    assertEquals(0, gate.generation)
    assertTrue(gate.shouldEmit())
  }

  @Test
  fun markReleased_isIdempotent() {
    val gate = LifecycleGate()
    assertTrue(gate.markReleased())
    assertTrue(gate.isReleased)
    assertFalse(gate.markReleased())
  }

  // The core emit-after-release guard: once released, no playback-state emit.
  @Test
  fun releasedPlayer_doesNotEmit() {
    val gate = LifecycleGate()
    gate.markReleased()
    assertFalse(gate.shouldEmit())
  }

  @Test
  fun beginGeneration_incrementsAndReturns() {
    val gate = LifecycleGate()
    assertEquals(1, gate.beginGeneration())
    assertEquals(2, gate.beginGeneration())
    assertEquals(2, gate.generation)
  }

  // A deferred callback captured before a source swap must be dropped.
  @Test
  fun shouldDeliverCallback_staleGenerationDropped() {
    val gate = LifecycleGate()
    val captured = gate.beginGeneration()
    assertTrue(gate.shouldDeliverCallback(captured))
    gate.beginGeneration()
    assertFalse(gate.shouldDeliverCallback(captured))
  }

  // A deferred callback must also be dropped once the player is released.
  @Test
  fun shouldDeliverCallback_releasedDropped() {
    val gate = LifecycleGate()
    val captured = gate.beginGeneration()
    gate.markReleased()
    assertFalse(gate.shouldDeliverCallback(captured))
  }
}
