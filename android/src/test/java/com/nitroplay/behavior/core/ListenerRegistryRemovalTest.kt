package com.nitroplay.video.core

import com.margelo.nitro.video.ListenerSubscription
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Locks in the lifetime contract behind the iOS EXC_BAD_ACCESS fix (Sentry YUPIV3-TN):
 * a listener removed mid-emit must NOT be invoked, because its JS owner may already be gone.
 * With the old snapshot-then-invoke registry, "B" would still be called.
 */
class ListenerRegistryRemovalTest {
  @Test
  fun listenerRemovedDuringEmit_isNotInvoked() {
    val registry = ListenerRegistry()
    val calls = mutableListOf<String>()
    var subB: ListenerSubscription? = null

    registry.add<() -> Unit>("e") {
      calls.add("A")
      subB?.remove()
    }
    subB = registry.add<() -> Unit>("e") { calls.add("B") }

    registry.emit<() -> Unit>("e") { it() }

    assertEquals(listOf("A"), calls)
  }
}
