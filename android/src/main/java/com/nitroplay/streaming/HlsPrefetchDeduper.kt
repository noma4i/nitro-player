package com.nitroplay.video.streaming

internal class HlsPrefetchDeduper(
  private val windowMs: Long,
  private val maxEntries: Int,
  private val nowMs: () -> Long = System::currentTimeMillis
) {
  private val entries = LinkedHashMap<String, Entry>()
  private val lock = Any()

  val size: Int
    get() = synchronized(lock) { entries.size }

  fun shouldPrefetch(key: String, durationSeconds: Double): Boolean {
    synchronized(lock) {
      val now = nowMs()
      val previous = entries[key]
      if (previous != null && now - previous.timestampMs < windowMs && durationSeconds <= previous.durationSeconds) {
        return false
      }

      entries.remove(key)
      entries[key] = Entry(
        timestampMs = now,
        durationSeconds = maxOf(durationSeconds, previous?.durationSeconds ?: durationSeconds)
      )
      trim(now)
      return true
    }
  }

  fun forget(key: String) {
    synchronized(lock) {
      entries.remove(key)
    }
  }

  fun clear() {
    synchronized(lock) {
      entries.clear()
    }
  }

  private fun trim(now: Long) {
    if (entries.size <= maxEntries) return

    val stale = entries.entries.iterator()
    while (stale.hasNext()) {
      if (now - stale.next().value.timestampMs > windowMs) {
        stale.remove()
      }
    }

    var overBudget = entries.size - maxEntries
    if (overBudget <= 0) return

    val oldest = entries.entries.iterator()
    while (oldest.hasNext() && overBudget > 0) {
      oldest.next()
      oldest.remove()
      overBudget -= 1
    }
  }

  private data class Entry(
    val timestampMs: Long,
    val durationSeconds: Double
  )
}
