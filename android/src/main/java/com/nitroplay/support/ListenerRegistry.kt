package com.nitroplay.video.core

import com.margelo.nitro.video.ListenerSubscription
import java.util.UUID

data class ListenerEntry(val id: UUID, val eventName: String, val callback: Any)

class ListenerRegistry {
  private val entries = mutableListOf<ListenerEntry>()
  private val lock = Any()

  fun <T> add(event: String, listener: T): ListenerSubscription {
    val id = UUID.randomUUID()
    synchronized(lock) { entries.add(ListenerEntry(id, event, listener as Any)) }
    return ListenerSubscription {
      synchronized(lock) { entries.removeAll { it.id == id } }
    }
  }

  @Suppress("UNCHECKED_CAST")
  fun <T> emit(event: String, invoke: (T) -> Unit) {
    val ids = synchronized(lock) { entries.filter { it.eventName == event }.map { it.id } }
    for (id in ids) {
      // Re-resolve under the lock right before invoking: if the listener was
      // removed (e.g. JS unsubscribed on unmount) between the snapshot and now,
      // skip it instead of invoking a callback whose JS owner may already be gone.
      val callback = synchronized(lock) { entries.firstOrNull { it.id == id }?.callback } ?: continue
      try {
        invoke(callback as T)
      } catch (e: Exception) {
        android.util.Log.e("ListenerRegistry", "Error in $event listener", e)
      }
    }
  }

  fun clearAll() {
    synchronized(lock) { entries.clear() }
  }

  fun hasListeners(event: String): Boolean {
    return synchronized(lock) { entries.any { it.eventName == event } }
  }
}
