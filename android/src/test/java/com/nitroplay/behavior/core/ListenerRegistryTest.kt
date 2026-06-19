package com.nitroplay.video.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ListenerRegistryTest {

  @Test
  fun add_emit_callsListener() {
    val registry = ListenerRegistry()
    var called = false
    registry.add("test", { called = true } as () -> Unit)
    registry.emit<() -> Unit>("test") { it() }
    assertTrue(called)
  }

  @Test
  fun add_multiple_emit_callsAll() {
    val registry = ListenerRegistry()
    val calls = mutableListOf<Int>()
    registry.add("event", { calls.add(1) } as () -> Unit)
    registry.add("event", { calls.add(2) } as () -> Unit)
    registry.emit<() -> Unit>("event") { it() }
    assertEquals(listOf(1, 2), calls)
  }

  @Test
  fun remove_stops_callbacks() {
    val registry = ListenerRegistry()
    var count = 0
    val sub = registry.add("event", { count++ } as () -> Unit)
    registry.emit<() -> Unit>("event") { it() }
    assertEquals(1, count)

    sub.remove()
    registry.emit<() -> Unit>("event") { it() }
    assertEquals(1, count)
  }

  @Test
  fun clearAll_removesAll() {
    val registry = ListenerRegistry()
    var count = 0
    registry.add("event", { count++ } as () -> Unit)
    registry.add("event", { count++ } as () -> Unit)
    registry.clearAll()
    registry.emit<() -> Unit>("event") { it() }
    assertEquals(0, count)
  }

  @Test
  fun emit_wrongEvent_doesNotCall() {
    val registry = ListenerRegistry()
    var called = false
    registry.add("eventA", { called = true } as () -> Unit)
    registry.emit<() -> Unit>("eventB") { it() }
    assertTrue(!called)
  }

  @Test
  fun emit_afterRemove_doesNotCall() {
    val registry = ListenerRegistry()
    var called = false
    val sub = registry.add("event", { called = true } as () -> Unit)
    sub.remove()
    registry.emit<() -> Unit>("event") { it() }
    assertTrue(!called)
  }
}
