package com.yupi.hls

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.net.URLEncoder

class HlsCacheProxyModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    private var server: HlsCacheProxyServer? = null
    private var port: Int = 18181
    private var shouldBeRunning: Boolean = false

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "HlsCacheProxy"

    @ReactMethod
    fun start(port: Int) {
        if (server != null) return
        this.port = if (port > 0) port else 18181
        shouldBeRunning = true
        startServer()
    }

    @ReactMethod
    fun stop() {
        shouldBeRunning = false
        server?.stop()
        server = null
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getProxiedUrl(url: String, headers: ReadableMap?): String {
        if (server == null) return url
        val encodedUrl = URLEncoder.encode(url, "UTF-8")
        val encodedHeaders = HlsHeaderCodec.encode(headers)
        val query = StringBuilder("url=").append(encodedUrl)
        if (encodedHeaders != null) {
            query.append("&headers=").append(URLEncoder.encode(encodedHeaders, "UTF-8"))
        }
        return "http://127.0.0.1:$port/hls/manifest.m3u8?$query"
    }

    @ReactMethod
    fun prefetchFirstSegment(url: String, headers: ReadableMap?, promise: Promise) {
        if (server == null) {
            promise.resolve(true)
            return
        }
        val headerMap = HlsHeaderCodec.decode(headers)
        server?.prefetch(url, headerMap, onComplete = {
            promise.resolve(true)
        }, onError = { err ->
            promise.reject("prefetch_error", err)
        })
    }

    @ReactMethod
    fun getCacheStats(promise: Promise) {
        val stats = server?.cacheStore?.getCacheStats()
        val result = Arguments.createMap().apply {
            putDouble("totalSize", (stats?.get("totalSize") as? Long)?.toDouble() ?: 0.0)
            putInt("fileCount", (stats?.get("fileCount") as? Int) ?: 0)
            putDouble("maxSize", (stats?.get("maxSize") as? Long)?.toDouble() ?: 5368709120.0)
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun getStreamCacheStats(url: String, promise: Promise) {
        val stats = server?.cacheStore?.getStreamCacheStats(url)
        val result = Arguments.createMap().apply {
            putDouble("totalSize", (stats?.get("totalSize") as? Long)?.toDouble() ?: 0.0)
            putInt("fileCount", (stats?.get("fileCount") as? Int) ?: 0)
            putDouble("maxSize", (stats?.get("maxSize") as? Long)?.toDouble() ?: 5368709120.0)
            putDouble("streamSize", (stats?.get("streamSize") as? Long)?.toDouble() ?: 0.0)
            putInt("streamFileCount", (stats?.get("streamFileCount") as? Int) ?: 0)
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun clearCache(promise: Promise) {
        server?.cacheStore?.clearAll()
        promise.resolve(true)
    }

    // LifecycleEventListener — self-heal on foreground return
    override fun onHostResume() {
        if (shouldBeRunning && (server == null || server?.isAlive != true)) {
            server?.stop()
            server = null
            startServer()
        }
    }

    override fun onHostPause() {
        // NanoHTTPD can keep running in background
    }

    override fun onHostDestroy() {
        shouldBeRunning = false
        server?.stop()
        server = null
    }

    private fun startServer() {
        server = HlsCacheProxyServer(port, reactContext)
        try {
            server?.start(NanoHttpdConfig.TIMEOUT_MS, false)
        } catch (_: Exception) {
            server = null
        }
    }
}
