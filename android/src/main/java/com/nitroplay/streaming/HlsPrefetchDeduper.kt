package com.nitroplay.video.streaming

internal class HlsPrefetchDeduper(
  private val windowMs: Long,
  private val maxEntries: Int,
  private val nowMs: () -> Long = System::currentTimeMillis
) {
  private val timestamps = LinkedHashMap<String, Long>()
  private val lock = Any()

  val size: Int
    get() = synchronized(lock) { timestamps.size }

  fun shouldPrefetch(key: String): Boolean {
    synchronized(lock) {
      val now = nowMs()
      val last = timestamps[key]
      if (last != null && now - last < windowMs) {
        return false
      }

      timestamps.remove(key)
      timestamps[key] = now
      trim(now)
      return true
    }
  }

  fun forget(key: String) {
    synchronized(lock) {
      timestamps.remove(key)
    }
  }

  fun clear() {
    synchronized(lock) {
      timestamps.clear()
    }
  }

  private fun trim(now: Long) {
    if (timestamps.size <= maxEntries) return

    val stale = timestamps.entries.iterator()
    while (stale.hasNext()) {
      if (now - stale.next().value > windowMs) {
        stale.remove()
      }
    }

    var overBudget = timestamps.size - maxEntries
    if (overBudget <= 0) return

    val oldest = timestamps.entries.iterator()
    while (oldest.hasNext() && overBudget > 0) {
      oldest.next()
      oldest.remove()
      overBudget -= 1
    }
  }
}
