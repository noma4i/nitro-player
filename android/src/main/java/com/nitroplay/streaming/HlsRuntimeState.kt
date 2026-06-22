package com.nitroplay.video.streaming

internal data class HlsRuntimeStateSnapshot(
  val port: Int,
  val didAutoStart: Boolean,
  val isExplicitlyStopped: Boolean
)

internal class HlsRuntimeState(
  private val defaultPort: Int = 0
) {
  private val lock = Any()
  private var port: Int = defaultPort
  private var didAutoStart = false
  private var isExplicitlyStopped = false

  fun start(requestedPort: Int?): Int {
    synchronized(lock) {
      val resolvedPort = if ((requestedPort ?: defaultPort) > 0) requestedPort ?: defaultPort else defaultPort
      port = resolvedPort
      isExplicitlyStopped = false
      return resolvedPort
    }
  }

  fun stop() {
    synchronized(lock) {
      didAutoStart = false
      isExplicitlyStopped = true
    }
  }

  fun suspendForHostLifecycle() {
    synchronized(lock) {
      didAutoStart = false
    }
  }

  fun portForImplicitStart(): Int? {
    synchronized(lock) {
      if (isExplicitlyStopped) return null
      if (didAutoStart) return null
      return port
    }
  }

  fun markAutoStarted() {
    synchronized(lock) {
      if (!isExplicitlyStopped) {
        didAutoStart = true
      }
    }
  }

  fun portForPlaybackRecoveryRestart(): Int? {
    synchronized(lock) {
      if (isExplicitlyStopped) return null
      return port
    }
  }

  fun snapshot(): HlsRuntimeStateSnapshot {
    synchronized(lock) {
      return HlsRuntimeStateSnapshot(
        port = port,
        didAutoStart = didAutoStart,
        isExplicitlyStopped = isExplicitlyStopped
      )
    }
  }
}
