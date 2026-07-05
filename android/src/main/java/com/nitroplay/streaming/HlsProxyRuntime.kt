package com.nitroplay.video.streaming

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import java.net.URLEncoder
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import com.nitroplay.video.preview.VideoPreviewRuntime
import com.nitroplay.video.streaming.cache.HlsCacheBudget
import com.nitroplay.video.streaming.cache.HlsCacheStore

object HlsProxyRuntime {
  // 0 = OS-assigned ephemeral port. A fixed port collides when several proxies
  // share the loopback, making the bind fail and silently fall back to direct
  // playback; the actual bound port is read back via HlsProxyServer.listeningPort().
  private const val DEFAULT_PORT = 0
  private const val PREFETCH_DEDUP_MS = 60_000L
  private const val PREFETCH_MAX_ENTRIES = 500

  private val lock = Any()
  private var desiredPort = DEFAULT_PORT
  private var didAutoStart = false
  private var isExplicitlyStopped = false
  private var isRegistered = false
  private var activeServer: HlsProxyServer? = null
  private var ownerGeneration = 0
  private var appContext: Context? = null
  private var configuredMaxCacheBytes = HlsCacheBudget.DEFAULT_MAX_BYTES
  private val prefetchDeduper = HlsPrefetchDeduper(PREFETCH_DEDUP_MS, PREFETCH_MAX_ENTRIES)
  private val prefetchExecutor = Executors.newSingleThreadExecutor()
  @Volatile private var prefetchSegmentCount = 2

  internal data class RuntimeStateSnapshot(
    val isRegistered: Boolean,
    val didAutoStart: Boolean,
    val isExplicitlyStopped: Boolean,
    val hasServer: Boolean
  )

  fun register(reactContext: ReactApplicationContext) {
    register(reactContext.applicationContext ?: reactContext)
  }

  fun register(context: Context) {
    synchronized(lock) {
      this.appContext = context.applicationContext ?: context
      isRegistered = true
    }
    VideoPreviewRuntime.register(context)
  }

  fun start(port: Int?) {
    val (nextPort, shouldRestartForPort) = synchronized(lock) {
      val previousPort = desiredPort
      val resolvedPort = normalizePort(port)
      desiredPort = resolvedPort
      didAutoStart = false
      isExplicitlyStopped = false
      isRegistered = true
      Pair(resolvedPort, activeServer?.isAlive == true && previousPort != resolvedPort)
    }
    if (ensureServerRunning(forceRestart = shouldRestartForPort, desiredPort = nextPort)) {
      markAutoStarted()
    }
  }

  fun stop() {
    synchronized(lock) {
      didAutoStart = false
      isExplicitlyStopped = true
    }
    stopServer()
  }

  fun onHostResume() {
    val shouldRun = synchronized(lock) { isRegistered && didAutoStart && !isExplicitlyStopped }
    if (shouldRun) {
      val forceRestart = synchronized(lock) { activeServer?.isAlive != true }
      ensureServerRunning(forceRestart = forceRestart)
    }
  }

  fun onHostDestroy() {
    synchronized(lock) {
      didAutoStart = false
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
    if (synchronized(lock) { isExplicitlyStopped }) return PlaybackRouteResolution(url = url, isProxying = false)
    ensureStarted()
    if (!ensureServerRunning()) {
      return PlaybackRouteResolution(url = url, isProxying = false)
    }
    val activeServer = synchronized(lock) { activeServer }
      ?: return PlaybackRouteResolution(url = url, isProxying = false)
    if (!activeServer.isAlive) {
      return PlaybackRouteResolution(url = url, isProxying = false)
    }
    val encodedUrl = URLEncoder.encode(url, "UTF-8")
    val encodedHeaders = HlsHeaderCodec.encode(headers)
    val streamKey = HlsIdentity.requestKey(url, headers)
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

  fun prefetchLeadingSegments(url: String, headers: Map<String, String>?, onComplete: () -> Unit, onError: (Throwable) -> Unit) {
    if (synchronized(lock) { isExplicitlyStopped }) {
      onComplete()
      return
    }
    if (!HlsManifestUrl.matches(url)) {
      onComplete()
      return
    }
    ensureStarted()

    val segmentCount = prefetchSegmentCount
    val dedupKey = HlsIdentity.requestKey(url, headers)
    val shouldPrefetch = prefetchDeduper.shouldPrefetch(dedupKey)

    if (!shouldPrefetch) {
      onComplete()
      return
    }

    val activeServer = synchronized(lock) { activeServer }
    if (activeServer == null) {
      prefetchDeduper.forget(dedupKey)
      onComplete()
      return
    }

    activeServer.prefetch(
      url,
      headers,
      segmentCount,
      onComplete,
      { error ->
        prefetchDeduper.forget(dedupKey)
        onError(error)
      }
    )
  }

  fun requestLeadingSegmentPrefetchAsync(url: String, headers: Map<String, String>?) {
    try {
      prefetchExecutor.execute {
        try {
          prefetchLeadingSegments(url, headers, onComplete = {}, onError = {})
        } catch (_: Throwable) {
        }
      }
    } catch (_: RejectedExecutionException) {
    }
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
    val streamKey = HlsIdentity.requestKey(url, headers)
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

  fun configureCache(maxBytes: Double?, prefetchSegments: Double? = null) {
    if (maxBytes != null) {
      val normalized = HlsCacheBudget.normalize(maxBytes.toLong())
      val context = synchronized(lock) {
        configuredMaxCacheBytes = normalized
        appContext
      }
      val cacheStore = synchronized(lock) { activeServer?.cacheStore }
      cacheStore?.setMaxBytes(normalized)
      if (cacheStore == null && context != null) {
        HlsCacheStore(context, normalized).close()
      }
    }

    if (prefetchSegments != null) {
      prefetchSegmentCount = normalizePrefetchSegmentCount(prefetchSegments.toInt())
    }
  }

  fun clearCache() {
    val (store, context, maxBytes) = synchronized(lock) {
      Triple(activeServer?.cacheStore, appContext, configuredMaxCacheBytes)
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
        didAutoStart = didAutoStart,
        isExplicitlyStopped = isExplicitlyStopped,
        hasServer = activeServer != null
      )
    }
  }

  internal fun prefetchTimestampCountForTests(): Int {
    return synchronized(lock) { prefetchDeduper.size }
  }

  internal fun configuredMaxCacheBytesForTests(): Long {
    return synchronized(lock) { configuredMaxCacheBytes }
  }

  internal fun configuredPrefetchSegmentCountForTests(): Int {
    return prefetchSegmentCount
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
      desiredPort = DEFAULT_PORT
      didAutoStart = false
      isExplicitlyStopped = false
      ownerGeneration = 0
      isRegistered = false
      appContext = null
      configuredMaxCacheBytes = HlsCacheBudget.DEFAULT_MAX_BYTES
      prefetchSegmentCount = 2
      prefetchDeduper.clear()
    }
    VideoPreviewRuntime.resetStateForTests()
  }

  fun restartForPlaybackRecovery() {
    val restartPort = synchronized(lock) {
      if (isExplicitlyStopped) return
      desiredPort
    }
    if (ensureServerRunning(forceRestart = true, desiredPort = restartPort)) {
      markAutoStarted()
    }
  }

  private fun ensureStarted() {
    synchronized(lock) { isRegistered = true }
    portForImplicitStart()?.let { startPort ->
      if (ensureServerRunning(forceRestart = false, desiredPort = startPort)) {
        markAutoStarted()
      }
    }
  }

  private fun ensureServerRunning(forceRestart: Boolean = false, desiredPort: Int = synchronized(lock) { this.desiredPort }): Boolean {
    val startPlan = synchronized(lock) {
      val context = appContext ?: return false
      val isAlive = activeServer?.isAlive == true
      if (!forceRestart && isAlive) {
        return true
      }
      val previous = activeServer
      activeServer = null
      ServerStartPlan(previous, context, ownerGeneration)
    }
    startPlan.previousServer?.stop()
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
      if (isExplicitlyStopped || ownerGeneration != startGeneration) {
        null
      } else {
        val replaced = activeServer
        activeServer = nextServer
        replaced
      }
    }
    val stored = synchronized(lock) { activeServer === nextServer }
    replacedServer?.stop()
    if (!stored) {
      nextServer.stop()
    }
    return stored && nextServer.isAlive
  }

  private fun stopServer(invalidatePendingStart: Boolean = true) {
    val previous = synchronized(lock) {
      if (invalidatePendingStart) {
        ownerGeneration += 1
      }
      val server = activeServer
      activeServer = null
      server
    }
    previous?.stop()
  }

  private fun activeCacheStoreStats(read: (HlsCacheStore) -> Map<String, Any>): Map<String, Any>? {
    val (store, context, maxBytes) = synchronized(lock) {
      Triple(activeServer?.cacheStore, appContext, configuredMaxCacheBytes)
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

  private data class ServerStartPlan(
    val previousServer: HlsProxyServer?,
    val context: Context,
    val startGeneration: Int
  )

  private fun markAutoStarted() {
    synchronized(lock) {
      if (!isExplicitlyStopped) {
        didAutoStart = true
      }
    }
  }

  private fun portForImplicitStart(): Int? {
    synchronized(lock) {
      if (isExplicitlyStopped || didAutoStart) {
        return null
      }
      return desiredPort
    }
  }

  private fun normalizePort(port: Int?): Int {
    val requestedPort = port ?: DEFAULT_PORT
    return if (requestedPort > 0) requestedPort else DEFAULT_PORT
  }

  private fun normalizePrefetchSegmentCount(count: Int): Int {
    return count.coerceIn(1, 6)
  }
}

internal data class PlaybackRouteResolution(
  val url: String,
  val isProxying: Boolean
)
