package com.nitroplay.hls

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import java.net.URLEncoder

object HlsProxyRuntime {
  private const val DEFAULT_PORT = 18181
  private const val PREFETCH_DEDUP_MS = 60_000L

  private val lock = Any()
  private var port: Int = DEFAULT_PORT
  private var isRegistered = false
  private var shouldBeRunning = false
  private var isExplicitlyStopped = false
  private var server: HlsCacheProxyServer? = null
  private var reactContext: ReactApplicationContext? = null
  private val prefetchTimestamps = LinkedHashMap<String, Long>()

  fun register(reactContext: ReactApplicationContext) {
    val (resolvedPort, needsStart) = synchronized(lock) {
      val alreadyRunning = isRegistered && shouldBeRunning
      this.reactContext = reactContext
      isRegistered = true
      shouldBeRunning = true
      isExplicitlyStopped = false
      Pair(port, !alreadyRunning)
    }
    if (needsStart) {
      ensureServerRunning(desiredPort = resolvedPort)
    }
  }

  fun start(port: Int?) {
    val (nextPort, shouldRestartForPort) = synchronized(lock) {
      val previousPort = this.port
      val resolvedPort = if ((port ?: DEFAULT_PORT) > 0) port ?: DEFAULT_PORT else DEFAULT_PORT
      this.port = resolvedPort
      isRegistered = true
      shouldBeRunning = true
      isExplicitlyStopped = false
      Pair(resolvedPort, server?.isAlive == true && previousPort != resolvedPort)
    }
    ensureServerRunning(forceRestart = shouldRestartForPort, desiredPort = nextPort)
  }

  fun stop() {
    synchronized(lock) {
      shouldBeRunning = false
      isExplicitlyStopped = true
    }
    stopServer()
  }

  fun onHostResume() {
    val shouldRun = synchronized(lock) { isRegistered && shouldBeRunning && !isExplicitlyStopped }
    if (shouldRun) {
      ensureServerRunning(forceRestart = server?.isAlive != true)
    }
  }

  fun onHostDestroy() {
    synchronized(lock) {
      shouldBeRunning = false
    }
    stopServer()
  }

  fun getProxiedUrl(url: String, headers: ReadableMap?): String {
    return getProxiedUrl(url, HlsHeaderCodec.decode(headers))
  }

  fun getProxiedUrl(url: String, headers: Map<String, String>?): String {
    val isStopped = synchronized(lock) { isExplicitlyStopped }
    if (isStopped) return url
    ensureAutoStarted()
    if (!ensureServerRunning()) return url
    val activeServer = synchronized(lock) { server } ?: return url
    if (!activeServer.isAlive) return url
    val encodedUrl = URLEncoder.encode(url, "UTF-8")
    val encodedHeaders = HlsHeaderCodec.encode(headers)
    val query = StringBuilder("url=").append(encodedUrl)
    if (encodedHeaders != null) {
      query.append("&headers=").append(URLEncoder.encode(encodedHeaders, "UTF-8"))
    }
    return "http://127.0.0.1:${activeServer.listeningPort()}/hls/manifest.m3u8?$query"
  }

  fun prefetchFirstSegment(url: String, headers: ReadableMap?, onComplete: () -> Unit, onError: (Throwable) -> Unit) {
    val isStopped = synchronized(lock) { isExplicitlyStopped }
    if (isStopped) {
      onComplete()
      return
    }
    ensureAutoStarted()

    val shouldPrefetch = synchronized(lock) {
      val now = System.currentTimeMillis()
      val last = prefetchTimestamps[url]
      if (last != null && now - last < PREFETCH_DEDUP_MS) {
        false
      } else {
        prefetchTimestamps[url] = now
        if (prefetchTimestamps.size > 500) {
          val iterator = prefetchTimestamps.entries.iterator()
          while (iterator.hasNext()) {
            if (now - iterator.next().value > PREFETCH_DEDUP_MS) {
              iterator.remove()
            }
          }
        }
        true
      }
    }

    if (!shouldPrefetch) {
      onComplete()
      return
    }

    val activeServer = synchronized(lock) { server }
    if (activeServer == null) {
      onComplete()
      return
    }

    activeServer.prefetch(url, HlsHeaderCodec.decode(headers), onComplete, onError)
  }

  fun getCacheStats() = Arguments.createMap().apply {
    val stats = server?.cacheStore?.getCacheStats()
    putDouble("totalSize", (stats?.get("totalSize") as? Long)?.toDouble() ?: 0.0)
    putInt("fileCount", (stats?.get("fileCount") as? Int) ?: 0)
    putDouble("maxSize", (stats?.get("maxSize") as? Long)?.toDouble() ?: 5368709120.0)
  }

  fun getStreamCacheStats(url: String) = Arguments.createMap().apply {
    val stats = server?.cacheStore?.getStreamCacheStats(url)
    putDouble("totalSize", (stats?.get("totalSize") as? Long)?.toDouble() ?: 0.0)
    putInt("fileCount", (stats?.get("fileCount") as? Int) ?: 0)
    putDouble("maxSize", (stats?.get("maxSize") as? Long)?.toDouble() ?: 5368709120.0)
    putDouble("streamSize", (stats?.get("streamSize") as? Long)?.toDouble() ?: 0.0)
    putInt("streamFileCount", (stats?.get("streamFileCount") as? Int) ?: 0)
  }

  fun clearCache() {
    server?.cacheStore?.clearAll()
  }

  private fun ensureAutoStarted() {
    synchronized(lock) {
      if (!isRegistered) {
        isRegistered = true
        shouldBeRunning = true
      }
    }
  }

  private fun ensureServerRunning(forceRestart: Boolean = false, desiredPort: Int = port): Boolean {
    val context = synchronized(lock) { reactContext } ?: return false
    val isAlive = synchronized(lock) { server?.isAlive == true }
    if (!forceRestart && isAlive) {
      return true
    }

    stopServer()
    synchronized(lock) {
      server = HlsCacheProxyServer(desiredPort, context)
      try {
        server?.start(NanoHttpdConfig.TIMEOUT_MS, false)
      } catch (_: Exception) {
        server = null
      }
      return server?.isAlive == true
    }
  }

  private fun stopServer() {
    synchronized(lock) {
      server?.stop()
      server = null
    }
  }
}
