package com.nitroplay.video.support

internal class SingleOwnerResourceSlot<T>(
  private val release: (T) -> Unit
) {
  private val lock = Any()
  private var resource: T? = null

  val current: T?
    get() = synchronized(lock) { resource }

  fun replace(next: T): T? {
    val previous = swap(next)
    previous?.let(release)
    return previous
  }

  fun clear(): T? {
    val previous = take()
    previous?.let(release)
    return previous
  }

  fun swap(next: T): T? {
    return synchronized(lock) {
      val previous = resource
      resource = next
      previous
    }
  }

  fun take(): T? {
    return synchronized(lock) {
      val previous = resource
      resource = null
      previous
    }
  }

  fun releaseResource(previous: T) {
    release(previous)
  }
}
