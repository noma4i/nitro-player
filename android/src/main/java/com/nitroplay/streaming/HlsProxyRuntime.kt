package com.nitroplay.video.streaming

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URLEncoder
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import com.nitroplay.video.preview.VideoPreviewRuntime
import com.nitroplay.video.streaming.cache.HlsCacheBudget
import com.nitroplay.video.streaming.cache.HlsCacheStore
import com.nitroplay.video.support.SingleOwnerResourceSlot

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
  private val prefetchExecutor = Executors.newSingleThreadExecutor()
  @Volatile private var prefetchSegmentCount = 2

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
    if (runtimeState.snapshot().isExplicitlyStopped) {
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

    val activeServer = serverSlot.current
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

  fun getStreamVariants(url: String, headers: Map<String, String>? = null): WritableArray {
    val result = Arguments.createArray()
    if (!HlsManifestUrl.matches(url)) {
      return result
    }

    val manifest = fetchText(url, headers)
    if (!HlsManifest.isMaster(manifest)) {
      return result
    }

    HlsManifest.extractStreamVariants(manifest, url).forEach { variant ->
      val map = Arguments.createMap()
      map.putDouble("bandwidth", variant.bandwidth.toDouble())
      variant.averageBandwidth?.let { map.putDouble("averageBandwidth", it.toDouble()) } ?: map.putNull("averageBandwidth")
      variant.width?.let { map.putInt("width", it) } ?: map.putNull("width")
      variant.height?.let { map.putInt("height", it) } ?: map.putNull("height")
      variant.codecs?.let { map.putString("codecs", it) } ?: map.putNull("codecs")
      map.putString("uri", variant.uri)
      result.pushMap(map)
    }
    return result
  }

  fun configureCache(maxBytes: Double?, prefetchSegments: Double? = null) {
    if (maxBytes != null) {
      val normalized = HlsCacheBudget.normalize(maxBytes.toLong())
      val context = synchronized(lock) {
        configuredMaxCacheBytes = normalized
        appContext
      }
      serverSlot.current?.cacheStore?.setMaxBytes(normalized)
      if (serverSlot.current == null && context != null) {
        HlsCacheStore(context, normalized).close()
      }
    }

    if (prefetchSegments != null) {
      prefetchSegmentCount = normalizePrefetchSegmentCount(prefetchSegments.toInt())
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
      runtimeState = HlsRuntimeState(DEFAULT_PORT)
      isRegistered = false
      appContext = null
      configuredMaxCacheBytes = HlsCacheBudget.DEFAULT_MAX_BYTES
      prefetchSegmentCount = 2
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

  private fun fetchText(url: String, headers: Map<String, String>?): String {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = NanoHttpdConfig.TIMEOUT_MS
      readTimeout = NanoHttpdConfig.TIMEOUT_MS
      requestMethod = "GET"
      headers?.forEach { (key, value) -> setRequestProperty(key, value) }
    }
    try {
      val statusCode = connection.responseCode
      if (statusCode >= 400) {
        throw IOException("HTTP $statusCode")
      }
      connection.inputStream.use { stream ->
        val data = stream.readBytes()
        if (data.isEmpty()) {
          throw IOException("Empty response body")
        }
        return data.toString(Charsets.UTF_8)
      }
    } finally {
      connection.disconnect()
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

  private fun normalizePrefetchSegmentCount(count: Int): Int {
    return count.coerceIn(1, 6)
  }
}

internal data class PlaybackRouteResolution(
  val url: String,
  val isProxying: Boolean
)
