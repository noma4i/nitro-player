package com.nitroplay.hls

import android.content.Context
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
  private var appContext: Context? = null
  private var configuredMaxCacheBytes = HlsCacheBudget.DEFAULT_MAX_BYTES
  private val prefetchDeduper = HlsPrefetchDeduper(PREFETCH_DEDUP_MS, PREFETCH_MAX_ENTRIES)

  internal data class RuntimeStateSnapshot(
    val isRegistered: Boolean,
    val didAutoStart: Boolean,
    val isExplicitlyStopped: Boolean,
    val hasServer: Boolean
  )

  fun register(reactContext: ReactApplicationContext) {
    synchronized(lock) {
      this.appContext = reactContext.applicationContext ?: reactContext
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
    val stats = activeCacheStoreStats { it.getCacheStats() }
    val fallbackMaxBytes = synchronized(lock) { configuredMaxCacheBytes }
    putDouble("totalSize", (stats?.get("totalSize") as? Long)?.toDouble() ?: 0.0)
    putInt("fileCount", (stats?.get("fileCount") as? Int) ?: 0)
    putDouble("maxSize", (stats?.get("maxSize") as? Long)?.toDouble() ?: fallbackMaxBytes.toDouble())
  }

  fun getStreamCacheStats(url: String, headers: Map<String, String>? = null) = Arguments.createMap().apply {
    val streamKey = HlsIdentity.sourceKey(url, headers)
    val stats = activeCacheStoreStats {
      it.getStreamCacheStats(streamKey)
    }
    val fallbackMaxBytes = synchronized(lock) { configuredMaxCacheBytes }
    putDouble("totalSize", (stats?.get("totalSize") as? Long)?.toDouble() ?: 0.0)
    putInt("fileCount", (stats?.get("fileCount") as? Int) ?: 0)
    putDouble("maxSize", (stats?.get("maxSize") as? Long)?.toDouble() ?: fallbackMaxBytes.toDouble())
    putDouble("streamSize", (stats?.get("streamSize") as? Long)?.toDouble() ?: 0.0)
    putInt("streamFileCount", (stats?.get("streamFileCount") as? Int) ?: 0)
  }

  fun configureCache(maxBytes: Double?) {
    val normalized = HlsCacheBudget.normalize(maxBytes?.toLong() ?: HlsCacheBudget.DEFAULT_MAX_BYTES)
    val context = synchronized(lock) {
      configuredMaxCacheBytes = normalized
      appContext
    }
    serverSlot.current?.cacheStore?.setMaxBytes(normalized)
    if (serverSlot.current == null && context != null) {
      HlsCacheStore(context, normalized).close()
    }
  }

  fun clearCache() {
    val (store, context, maxBytes) = synchronized(lock) {
      Triple(serverSlot.current?.cacheStore, appContext, configuredMaxCacheBytes)
    }
    if (store != null) {
      store.clearAll()
      return
    }
    context?.let {
      HlsCacheStore(it, maxBytes).useAndClose { cacheStore ->
        cacheStore.clearAll()
      }
    }
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

  internal fun configuredMaxCacheBytesForTests(): Long {
    return synchronized(lock) { configuredMaxCacheBytes }
  }

  internal fun registerForTests() {
    synchronized(lock) {
      isRegistered = true
    }
  }

  internal fun registerForTests(context: Context) {
    synchronized(lock) {
      appContext = context.applicationContext ?: context
      isRegistered = true
    }
  }

  internal fun resetStateForTests() {
    stopServer()
    synchronized(lock) {
      runtimeState = HlsRuntimeState(DEFAULT_PORT)
      isRegistered = false
      appContext = null
      configuredMaxCacheBytes = HlsCacheBudget.DEFAULT_MAX_BYTES
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
    val startPlan = synchronized(lock) {
      val context = appContext ?: return false
      val isAlive = serverSlot.current?.isAlive == true
      if (!forceRestart && isAlive) {
        return true
      }
      serverSlot.take()?.let { PreviousServer(it, context, serverStopGeneration) }
        ?: PreviousServer(null, context, serverStopGeneration)
    }
    startPlan.server?.let { serverSlot.releaseResource(it) }
    val context = startPlan.context
    val startGeneration = startPlan.startGeneration
    val maxCacheBytes = synchronized(lock) { configuredMaxCacheBytes }
    val nextServer = HlsProxyServer(desiredPort, context, maxCacheBytes)
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

    val replacedServer = synchronized(lock) {
      if (runtimeState.snapshot().isExplicitlyStopped || serverStopGeneration != startGeneration) {
        null
      } else {
        serverSlot.swap(nextServer)
      }
    }
    val stored = serverSlot.current === nextServer
    replacedServer?.let { serverSlot.releaseResource(it) }
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

  private fun activeCacheStoreStats(read: (HlsCacheStore) -> Map<String, Any>): Map<String, Any>? {
    val (store, context, maxBytes) = synchronized(lock) {
      Triple(serverSlot.current?.cacheStore, appContext, configuredMaxCacheBytes)
    }
    if (store != null) {
      return read(store)
    }
    return context?.let {
      HlsCacheStore(it, maxBytes).useAndClose(read)
    }
  }

  private inline fun <T> HlsCacheStore.useAndClose(block: (HlsCacheStore) -> T): T {
    try {
      return block(this)
    } finally {
      close()
    }
  }

  private data class PreviousServer(
    val server: HlsProxyServer?,
    val context: Context,
    val startGeneration: Int
  )
}

internal data class PlaybackRouteResolution(
  val url: String,
  val isProxying: Boolean
)
