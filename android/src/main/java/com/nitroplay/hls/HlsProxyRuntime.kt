package com.nitroplay.hls

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import java.net.URLEncoder

object HlsProxyRuntime {
  private const val DEFAULT_PORT = 18181
  private const val PREFETCH_DEDUP_MS = 60_000L

  private val lock = Any()
  private var server: HlsCacheProxyServer? = null
  private var reactContext: ReactApplicationContext? = null
  private var port: Int = DEFAULT_PORT
  private var shouldBeRunning: Boolean = true
  private var wasExplicitlyStopped: Boolean = false
  private var didAutoStart: Boolean = false
  private val prefetchTimestamps = LinkedHashMap<String, Long>()

  fun register(reactContext: ReactApplicationContext) {
    synchronized(lock) {
      this.reactContext = reactContext
      shouldBeRunning = true
    }
    ensureServerRunning()
  }

  fun start(port: Int?) {
    val nextPort = if ((port ?: DEFAULT_PORT) > 0) port ?: DEFAULT_PORT else DEFAULT_PORT
    val shouldRestartForPort = synchronized(lock) {
      val restart = server?.isAlive == true && this.port != nextPort
      shouldBeRunning = true
      wasExplicitlyStopped = false
      didAutoStart = true
      this.port = nextPort
      restart || server?.isAlive != true
    }
    ensureServerRunning(forceRestart = shouldRestartForPort)
  }

  fun stop() {
    synchronized(lock) {
      shouldBeRunning = false
      wasExplicitlyStopped = true
      didAutoStart = false
    }
    stopServer()
  }

  fun onHostResume() {
    ensureServerRunning(forceRestart = server?.isAlive != true)
  }

  fun onHostDestroy() {
    synchronized(lock) {
      shouldBeRunning = false
      didAutoStart = false
    }
    stopServer()
  }

  fun getProxiedUrl(url: String, headers: ReadableMap?): String {
    return getProxiedUrl(url, HlsHeaderCodec.decode(headers))
  }

  fun getProxiedUrl(url: String, headers: Map<String, String>?): String {
    ensureStarted()
    val activeServer = server ?: return url
    val encodedUrl = URLEncoder.encode(url, "UTF-8")
    val encodedHeaders = HlsHeaderCodec.encode(headers)
    val query = StringBuilder("url=").append(encodedUrl)
    if (encodedHeaders != null) {
      query.append("&headers=").append(URLEncoder.encode(encodedHeaders, "UTF-8"))
    }
    return "http://127.0.0.1:${activeServer.listeningPort()}/hls/manifest.m3u8?$query"
  }

  fun prefetchFirstSegment(url: String, headers: ReadableMap?, onComplete: () -> Unit, onError: (Throwable) -> Unit) {
    ensureStarted()

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

    val activeServer = server
    if (activeServer == null) {
      onComplete()
      return
    }

    activeServer.prefetch(url, HlsHeaderCodec.decode(headers), onComplete, onError)
  }

  fun getCacheStats() = Arguments.createMap().apply {
    ensureStarted()
    val stats = server?.cacheStore?.getCacheStats()
    putDouble("totalSize", (stats?.get("totalSize") as? Long)?.toDouble() ?: 0.0)
    putInt("fileCount", (stats?.get("fileCount") as? Int) ?: 0)
    putDouble("maxSize", (stats?.get("maxSize") as? Long)?.toDouble() ?: 5368709120.0)
  }

  fun getStreamCacheStats(url: String) = Arguments.createMap().apply {
    ensureStarted()
    val stats = server?.cacheStore?.getStreamCacheStats(url)
    putDouble("totalSize", (stats?.get("totalSize") as? Long)?.toDouble() ?: 0.0)
    putInt("fileCount", (stats?.get("fileCount") as? Int) ?: 0)
    putDouble("maxSize", (stats?.get("maxSize") as? Long)?.toDouble() ?: 5368709120.0)
    putDouble("streamSize", (stats?.get("streamSize") as? Long)?.toDouble() ?: 0.0)
    putInt("streamFileCount", (stats?.get("streamFileCount") as? Int) ?: 0)
  }

  fun clearCache() {
    ensureStarted()
    server?.cacheStore?.clearAll()
  }

  private fun ensureStarted() {
    synchronized(lock) {
      if (wasExplicitlyStopped) {
        return
      }
      if (!didAutoStart) {
        didAutoStart = true
        shouldBeRunning = true
      }
    }
    ensureServerRunning()
  }

  private fun ensureServerRunning(forceRestart: Boolean = false): Boolean {
    val context = synchronized(lock) { reactContext } ?: return false
    val isAlive = server?.isAlive == true
    val shouldRun = synchronized(lock) {
      if (!shouldBeRunning && !wasExplicitlyStopped) {
        shouldBeRunning = true
      }
      shouldBeRunning
    }
    if (!shouldRun) {
      return false
    }
    if (!forceRestart && isAlive) {
      return true
    }

    stopServer()
    synchronized(lock) {
      server = HlsCacheProxyServer(port, context)
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
