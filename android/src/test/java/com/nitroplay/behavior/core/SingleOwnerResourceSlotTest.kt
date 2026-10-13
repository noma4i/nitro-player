package com.nitroplay.video.behavior.core

import com.nitroplay.video.support.SingleOwnerResourceSlot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class SingleOwnerResourceSlotTest {
  private class Resource

  @Test
  fun replaceReleasesPreviousOwnerOnly() {
    val released = mutableListOf<Resource>()
    val slot = SingleOwnerResourceSlot<Resource> { released.add(it) }
    val first = Resource()
    val second = Resource()

    assertNull(slot.replace(first))
    assertSame(first, slot.replace(second))

    assertEquals(1, released.size)
    assertSame(first, released[0])
    assertSame(second, slot.current)
  }

  @Test
  fun takeAndSwapDoNotRelease() {
    var releaseCount = 0
    val slot = SingleOwnerResourceSlot<Resource> { releaseCount += 1 }
    val first = Resource()
    val second = Resource()
    slot.swap(first)

    assertSame(first, slot.swap(second))
    assertSame(second, slot.take())

    assertNull(slot.current)
    assertEquals(0, releaseCount)
  }

  @Test
  fun clearReleasesCurrentOwnerOnce() {
    var releaseCount = 0
    val slot = SingleOwnerResourceSlot<Resource> { releaseCount += 1 }
    slot.swap(Resource())

    assertNotNull(slot.clear())
    assertNull(slot.clear())

    assertEquals(1, releaseCount)
  }
}
