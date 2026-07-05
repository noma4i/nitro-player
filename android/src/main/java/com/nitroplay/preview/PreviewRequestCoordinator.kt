package com.nitroplay.video.preview

import java.util.concurrent.CompletableFuture
import java.util.concurrent.Future

internal interface PreviewRequest<T> {
  val isCancelled: Boolean
  fun await(): T?
  fun onComplete(callback: (T?) -> Unit): Future<*>
  fun cancel()
}

internal class PreviewWork<T>(
  val future: CompletableFuture<T?>,
  private val cancelWork: () -> Unit
) {
  fun cancel() {
    cancelWork()
    future.cancel(true)
  }

  companion object {
    fun <T> completed(value: T?): PreviewWork<T> {
      return PreviewWork(CompletableFuture.completedFuture(value)) {}
    }
  }
}

internal class PreviewRequestCoordinator<K, T> {
  private class Entry<T>(
    val work: PreviewWork<T>
  ) {
    var waiters: Int = 0
    var isCancelled: Boolean = false

    fun cancel() {
      if (isCancelled) return
      isCancelled = true
      work.cancel()
    }
  }

  private val lock = Any()
  private val inflight = mutableMapOf<K, Entry<T>>()

  val inflightCount: Int
    get() = synchronized(lock) { inflight.size }

  fun acquire(key: K, createWork: () -> PreviewWork<T>): PreviewRequest<T> {
    synchronized(lock) {
      val entry = inflight[key] ?: Entry(createWork()).also { inflight[key] = it }
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
        val result = entry.work.future.get()
        synchronized(lock) {
          if (isCancelled || entry.isCancelled || inflight[key] !== entry) return null
        }
        result
      } catch (_: Exception) {
        null
      }
    }

    override fun onComplete(callback: (T?) -> Unit): Future<*> {
      if (isCancelled) {
        return CompletableFuture.completedFuture(null)
      }
      return entry.work.future.handle { result, error ->
        val shouldDeliver = synchronized(lock) {
          !isCancelled && !entry.isCancelled && inflight[key] === entry
        }
        if (shouldDeliver) {
          callback(if (error == null) result else null)
        }
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
