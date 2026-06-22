package com.nitroplay.video.behavior.hls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertNull
import org.junit.Test
import com.nitroplay.video.support.SingleOwnerResourceSlot

class SingleOwnerResourceSlotTest {
  private class Resource {
    var stopCount = 0
    fun stop() {
      stopCount += 1
    }
  }

  @Test
  fun replace_stopsPreviousResourceAndKeepsLatest() {
    val slot = SingleOwnerResourceSlot<Resource> { it.stop() }
    val first = Resource()
    val second = Resource()

    val previous = slot.replace(first)
    assertNull(previous)

    val replaced = slot.replace(second)

    assertSame(first, replaced)
    assertSame(second, slot.current)
    assertEquals(1, first.stopCount)
    assertEquals(0, second.stopCount)
  }

  @Test
  fun clearOnlyStopsTheCurrentResourceOnce() {
    val slot = SingleOwnerResourceSlot<Resource> { it.stop() }
    val first = Resource()
    val second = Resource()

    slot.replace(first)
    slot.replace(second)
    slot.clear()
    slot.clear()

    assertEquals(1, first.stopCount)
    assertEquals(1, second.stopCount)
    assertNull(slot.current)
  }
}
