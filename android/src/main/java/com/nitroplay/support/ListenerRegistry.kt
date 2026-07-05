package com.nitroplay.video.support

import com.margelo.nitro.video.ListenerSubscription
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import java.util.UUID

data class ListenerEntry(
  val id: UUID,
  val callback: Any,
  val active: AtomicBoolean = AtomicBoolean(true)
)

class ListenerRegistry {
  private val entries = ConcurrentHashMap<String, CopyOnWriteArrayList<ListenerEntry>>()

  fun <T> add(event: String, listener: T): ListenerSubscription {
    val id = UUID.randomUUID()
    val eventEntries = entries.getOrPut(event) { CopyOnWriteArrayList() }
    val entry = ListenerEntry(id, listener as Any)
    eventEntries.add(entry)
    return ListenerSubscription {
      if (entry.active.compareAndSet(true, false)) {
        eventEntries.remove(entry)
      }
    }
  }

  @Suppress("UNCHECKED_CAST")
  fun <T> emit(event: String, invoke: (T) -> Unit) {
    val eventEntries = entries[event] ?: return
    for (entry in eventEntries) {
      // Preserve the remove-during-emit contract: if JS unsubscribes before this
      // turn reaches the listener, skip it even though CopyOnWriteArrayList is
      // iterating a stable snapshot.
      if (!entry.active.get()) {
        continue
      }
      try {
        invoke(entry.callback as T)
      } catch (e: Exception) {
        android.util.Log.e("ListenerRegistry", "Error in $event listener", e)
      }
    }
  }

  fun clearAll() {
    entries.values.forEach { eventEntries ->
      eventEntries.forEach { it.active.set(false) }
    }
    entries.clear()
  }

  fun hasListeners(event: String): Boolean {
    return entries[event]?.any { it.active.get() } == true
  }
}
