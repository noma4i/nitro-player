package com.nitroplay.hls

import java.util.concurrent.Future

internal interface PreviewRequest<T> {
  val isCancelled: Boolean
  fun await(): T?
  fun cancel()
}

internal class PreviewRequestCoordinator<K, T> {
  private class Entry<T>(
    val future: Future<T?>
  ) {
    var waiters: Int = 0
    var isCancelled: Boolean = false

    fun cancel() {
      if (isCancelled) return
      isCancelled = true
      future.cancel(true)
    }
  }

  private val lock = Any()
  private val inflight = mutableMapOf<K, Entry<T>>()

  val inflightCount: Int
    get() = synchronized(lock) { inflight.size }

  fun acquire(key: K, createFuture: () -> Future<T?>): PreviewRequest<T> {
    synchronized(lock) {
      val entry = inflight[key] ?: Entry(createFuture()).also { inflight[key] = it }
      entry.waiters += 1
      return Handle(key, entry)
    }
  }

  fun cancelAll() {
    synchronized(lock) {
      inflight.values.forEach { it.cancel() }
      inflight.clear()
    }
  }

  private inner class Handle(
    private val key: K,
    private val entry: Entry<T>
  ) : PreviewRequest<T> {
    @Volatile
    override var isCancelled: Boolean = false
      private set

    override fun await(): T? {
      if (isCancelled) return null
      synchronized(lock) {
        if (entry.isCancelled || inflight[key] !== entry) return null
      }
      return try {
        val result = entry.future.get()
        synchronized(lock) {
          if (isCancelled || entry.isCancelled || inflight[key] !== entry) return null
        }
        result
      } catch (_: Exception) {
        null
      }
    }

    override fun cancel() {
      synchronized(lock) {
        if (isCancelled) return
        isCancelled = true
        if (inflight[key] !== entry) return
        entry.waiters = (entry.waiters - 1).coerceAtLeast(0)
        if (entry.waiters == 0) {
          inflight.remove(key)
          entry.cancel()
        }
      }
    }
  }
}
