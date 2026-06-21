package com.nitroplay.hls

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import java.net.URLEncoder

object HlsProxyRuntime {
  // 0 = OS-assigned ephemeral port. A fixed port collides when several proxies
  // share the loopback, making the bind fail and silently fall back to direct
  // playback; the actual bound port is read back via HlsProxyServer.listeningPort().
  private const val DEFAULT_PORT = 0
  private const val PREFETCH_DEDUP_MS = 60_000L
  private const val PREFETCH_MAX_ENTRIES = 500

  private val lock = Any()
  private var runtimeState = HlsRuntimeState(DEFAULT_PORT)
  private var isRegistered = false
  private val serverSlot = SingleOwnerResourceSlot<HlsProxyServer> { it.stop() }
  private var serverStopGeneration = 0
  private var reactContext: ReactApplicationContext? = null
  private val prefetchDeduper = HlsPrefetchDeduper(PREFETCH_DEDUP_MS, PREFETCH_MAX_ENTRIES)

  internal data class RuntimeStateSnapshot(
    val isRegistered: Boolean,
    val didAutoStart: Boolean,
    val isExplicitlyStopped: Boolean,
    val hasServer: Boolean
  )

  fun register(reactContext: ReactApplicationContext) {
    synchronized(lock) {
      this.reactContext = reactContext
      isRegistered = true
    }
    VideoPreviewRuntime.register(reactContext)
  }

  fun start(port: Int?) {
    val (nextPort, shouldRestartForPort) = synchronized(lock) {
      val previousPort = runtimeState.snapshot().port
      val resolvedPort = runtimeState.start(port)
      isRegistered = true
      Pair(resolvedPort, serverSlot.current?.isAlive == true && previousPort != resolvedPort)
    }
    if (ensureServerRunning(forceRestart = shouldRestartForPort, desiredPort = nextPort)) {
      runtimeState.markAutoStarted()
    }
  }

  fun stop() {
    synchronized(lock) {
      runtimeState.stop()
    }
    stopServer()
  }

  fun onHostResume() {
    val state = runtimeState.snapshot()
    val shouldRun = synchronized(lock) { isRegistered && state.didAutoStart && !state.isExplicitlyStopped }
    if (shouldRun) {
      val forceRestart = synchronized(lock) { serverSlot.current?.isAlive != true }
      ensureServerRunning(forceRestart = forceRestart)
    }
  }

  fun onHostDestroy() {
    synchronized(lock) {
      runtimeState.suspendForHostLifecycle()
    }
    stopServer()
  }

  fun getProxiedUrl(url: String, headers: ReadableMap?): String {
    return getProxiedUrl(url, HlsHeaderCodec.decode(headers))
  }

  fun getProxiedUrl(url: String, headers: Map<String, String>?): String {
    return resolvePlaybackRoute(url, headers).url
  }

  internal fun resolvePlaybackRoute(url: String, headers: Map<String, String>?): PlaybackRouteResolution {
    if (runtimeState.snapshot().isExplicitlyStopped) return PlaybackRouteResolution(url = url, isProxying = false)
    ensureStarted()
    if (!ensureServerRunning()) {
      return PlaybackRouteResolution(url = url, isProxying = false)
    }
    val activeServer = serverSlot.current
      ?: return PlaybackRouteResolution(url = url, isProxying = false)
    if (!activeServer.isAlive) {
      return PlaybackRouteResolution(url = url, isProxying = false)
    }
    val encodedUrl = URLEncoder.encode(url, "UTF-8")
    val encodedHeaders = HlsHeaderCodec.encode(headers)
    val streamKey = HlsIdentity.sourceKey(url, headers)
    val query = StringBuilder("url=").append(encodedUrl)
    if (encodedHeaders != null) {
      query.append("&headers=").append(URLEncoder.encode(encodedHeaders, "UTF-8"))
    }
    query.append("&streamKey=").append(URLEncoder.encode(streamKey, "UTF-8"))
    return PlaybackRouteResolution(
      url = "http://127.0.0.1:${activeServer.listeningPort()}/hls/manifest.m3u8?$query",
      isProxying = true
    )
  }

  fun prefetchFirstSegment(url: String, headers: ReadableMap?, onComplete: () -> Unit, onError: (Throwable) -> Unit) {
    if (runtimeState.snapshot().isExplicitlyStopped) {
      onComplete()
      return
    }
    if (!HlsManifestUrl.matches(url)) {
      onComplete()
      return
    }
    ensureStarted()

    val decodedHeaders = HlsHeaderCodec.decode(headers)
    val dedupKey = HlsIdentity.sourceKey(url, decodedHeaders)
    val shouldPrefetch = prefetchDeduper.shouldPrefetch(dedupKey)

    if (!shouldPrefetch) {
      onComplete()
      return
    }

    val activeServer = serverSlot.current
    if (activeServer == null) {
      prefetchDeduper.forget(dedupKey)
      onComplete()
      return
    }

    activeServer.prefetch(
      url,
      decodedHeaders,
      onComplete,
      { error ->
        prefetchDeduper.forget(dedupKey)
        onError(error)
      }
    )
  }

  fun getThumbnailUrl(url: String, headers: Map<String, String>?): String? {
    return VideoPreviewRuntime.getFirstFrame(url, headers, null)?.uri
  }

  fun peekThumbnailUrl(url: String, headers: Map<String, String>?): String? {
    return VideoPreviewRuntime.peekFirstFrame(url, headers, null)?.uri
  }

  fun getCacheStats() = Arguments.createMap().apply {
    val stats = serverSlot.current?.cacheStore?.getCacheStats()
    putDouble("totalSize", (stats?.get("totalSize") as? Long)?.toDouble() ?: 0.0)
    putInt("fileCount", (stats?.get("fileCount") as? Int) ?: 0)
    putDouble("maxSize", (stats?.get("maxSize") as? Long)?.toDouble() ?: 5368709120.0)
  }

  fun getStreamCacheStats(url: String, headers: Map<String, String>? = null) = Arguments.createMap().apply {
    val stats = synchronized(lock) {
      serverSlot.current?.cacheStore?.getStreamCacheStats(HlsIdentity.sourceKey(url, headers))
    }
    putDouble("totalSize", (stats?.get("totalSize") as? Long)?.toDouble() ?: 0.0)
    putInt("fileCount", (stats?.get("fileCount") as? Int) ?: 0)
    putDouble("maxSize", (stats?.get("maxSize") as? Long)?.toDouble() ?: 5368709120.0)
    putDouble("streamSize", (stats?.get("streamSize") as? Long)?.toDouble() ?: 0.0)
    putInt("streamFileCount", (stats?.get("streamFileCount") as? Int) ?: 0)
  }

  fun clearCache() {
    serverSlot.current?.cacheStore?.clearAll()
  }

  fun clearPreview() {
    VideoPreviewRuntime.clear()
  }

  internal fun snapshotStateForTests(): RuntimeStateSnapshot {
    synchronized(lock) {
      return RuntimeStateSnapshot(
        isRegistered = isRegistered,
        didAutoStart = runtimeState.snapshot().didAutoStart,
        isExplicitlyStopped = runtimeState.snapshot().isExplicitlyStopped,
        hasServer = serverSlot.current != null
      )
    }
  }

  internal fun prefetchTimestampCountForTests(): Int {
    return synchronized(lock) { prefetchDeduper.size }
  }

  internal fun registerForTests() {
    synchronized(lock) {
      isRegistered = true
    }
  }

  internal fun resetStateForTests() {
    stopServer()
    synchronized(lock) {
      runtimeState = HlsRuntimeState(DEFAULT_PORT)
      isRegistered = false
      reactContext = null
      prefetchDeduper.clear()
    }
    VideoPreviewRuntime.resetStateForTests()
  }

  fun restartForPlaybackRecovery() {
    val desiredPort = runtimeState.portForPlaybackRecoveryRestart() ?: return
    if (ensureServerRunning(forceRestart = true, desiredPort = desiredPort)) {
      runtimeState.markAutoStarted()
    }
  }

  private fun ensureStarted() {
    synchronized(lock) { isRegistered = true }
    runtimeState.portForImplicitStart()?.let {
      if (ensureServerRunning(forceRestart = false, desiredPort = it)) {
        runtimeState.markAutoStarted()
      }
    }
  }

  private fun ensureServerRunning(forceRestart: Boolean = false, desiredPort: Int = runtimeState.snapshot().port): Boolean {
    val (context, startGeneration) = synchronized(lock) {
      val context = reactContext ?: return false
      val isAlive = serverSlot.current?.isAlive == true
      if (!forceRestart && isAlive) {
        return true
      }
      stopServer(invalidatePendingStart = false)
      Pair(context, serverStopGeneration)
    }
    val nextServer = HlsProxyServer(desiredPort, context)
    val started = try {
      nextServer.start(NanoHttpdConfig.TIMEOUT_MS, false)
      nextServer.isAlive
    } catch (_: Exception) {
      false
    }

    if (!started) {
      nextServer.stop()
      return false
    }

    val previous = synchronized(lock) {
      if (runtimeState.snapshot().isExplicitlyStopped || serverStopGeneration != startGeneration) {
        null
      } else {
        serverSlot.swap(nextServer)
      }
    }
    val stored = serverSlot.current === nextServer
    previous?.let { serverSlot.releaseResource(it) }
    if (!stored) {
      nextServer.stop()
    }
    return stored && nextServer.isAlive
  }

  private fun stopServer(invalidatePendingStart: Boolean = true) {
    val previous = synchronized(lock) {
      if (invalidatePendingStart) {
        serverStopGeneration += 1
      }
      serverSlot.take()
    }
    previous?.let { serverSlot.releaseResource(it) }
  }
}

internal data class PlaybackRouteResolution(
  val url: String,
  val isProxying: Boolean
)
