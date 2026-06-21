package com.nitroplay.hls

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
      didAutoStart = true
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

  fun shouldStartForImplicitUse(): Int? {
    synchronized(lock) {
      if (isExplicitlyStopped) return null
      if (didAutoStart) return null
      didAutoStart = true
      return port
    }
  }

  fun shouldRestartForPlaybackRecovery(): Int? {
    synchronized(lock) {
      if (isExplicitlyStopped) return null
      didAutoStart = true
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
