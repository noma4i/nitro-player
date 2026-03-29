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
    val snapshot = synchronized(lock) { entries.filter { it.eventName == event }.toList() }
    for (entry in snapshot) {
      try {
        invoke(entry.callback as T)
      } catch (_: Exception) {}
    }
  }

  fun clearAll() {
    synchronized(lock) { entries.clear() }
  }
}
