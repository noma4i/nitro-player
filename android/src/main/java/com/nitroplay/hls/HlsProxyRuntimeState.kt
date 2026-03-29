package com.nitroplay.hls

internal class HlsProxyRuntimeState(private val defaultPort: Int = 18181) {
  var port: Int = defaultPort
    private set

  private var isRegistered: Boolean = false
  private var shouldBeRunning: Boolean = false
  private var isExplicitlyStopped: Boolean = false

  @Synchronized
  fun register(): Int {
    isRegistered = true
    shouldBeRunning = true
    isExplicitlyStopped = false
    return port
  }

  @Synchronized
  fun start(nextPort: Int?): Int {
    val resolvedPort = if ((nextPort ?: defaultPort) > 0) {
      nextPort ?: defaultPort
    } else {
      defaultPort
    }

    port = resolvedPort
    isRegistered = true
    shouldBeRunning = true
    isExplicitlyStopped = false
    return port
  }

  @Synchronized
  fun stop() {
    shouldBeRunning = false
    isExplicitlyStopped = true
  }

  @Synchronized
  fun onHostResume(): Boolean {
    return isRegistered && shouldBeRunning && !isExplicitlyStopped
  }

  @Synchronized
  fun onHostDestroy() {
    shouldBeRunning = false
  }

  @Synchronized
  fun shouldEnsureRunningForUse(): Boolean {
    return isRegistered && shouldBeRunning && !isExplicitlyStopped
  }
}
