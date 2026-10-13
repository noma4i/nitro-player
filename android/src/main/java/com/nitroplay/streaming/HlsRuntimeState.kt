package com.nitroplay.video.streaming

internal class HlsRuntimeState(
  private val defaultPort: Int = 0
) {
  private val lock = Any()
  private val requestedPort = defaultPort
  private var boundPort: Int = 0
  private var didAutoStart = false

  fun suspendForHostLifecycle() {
    synchronized(lock) {
      didAutoStart = false
    }
  }

  fun portForImplicitStart(): Int? {
    synchronized(lock) {
      if (didAutoStart) return null
      return requestedPort
    }
  }

  fun markAutoStarted() {
    synchronized(lock) {
      didAutoStart = true
    }
  }

  /** Returns true when the bound port changed, invalidating already-resolved routes. */
  fun recordBoundPort(actualPort: Int): Boolean {
    synchronized(lock) {
      if (actualPort <= 0) {
        return false
      }
      val changed = boundPort != 0 && boundPort != actualPort
      boundPort = actualPort
      return changed
    }
  }

  fun portForPlaybackRecoveryRestart(): Int? {
    synchronized(lock) {
      if (!didAutoStart) return null
      return if (boundPort > 0) boundPort else requestedPort
    }
  }

  fun didAutoStart(): Boolean {
    synchronized(lock) {
      return didAutoStart
    }
  }
}
