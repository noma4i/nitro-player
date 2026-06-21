package com.nitroplay.hls

import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class NitroPlayStreamRuntimeModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
    companion object {
        private val previewExecutor: ExecutorService = Executors.newFixedThreadPool(2)
    }

    init {
        reactContext.addLifecycleEventListener(this)
        HlsProxyRuntime.register(reactContext)
    }

    override fun getName(): String = "NitroPlayStreamRuntime"

    @ReactMethod
    fun start(port: Int) {
        HlsProxyRuntime.start(port)
    }

    @ReactMethod
    fun stop() {
        HlsProxyRuntime.stop()
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getProxiedUrl(url: String, headers: ReadableMap?): String {
        return HlsProxyRuntime.getProxiedUrl(url, headers)
    }

    @ReactMethod
    fun prefetchFirstSegment(url: String, headers: ReadableMap?, promise: Promise) {
        try {
            HlsProxyRuntime.prefetchFirstSegment(url, headers, onComplete = {
                promise.resolve(true)
            }, onError = { err ->
                promise.reject("prefetch_error", err)
            })
        } catch (err: Throwable) {
            promise.reject("prefetch_error", err)
        }
    }

    @ReactMethod
    fun getCacheStats(promise: Promise) {
        promise.resolve(HlsProxyRuntime.getCacheStats())
    }

    @ReactMethod
    fun getStreamCacheStats(url: String, headers: ReadableMap?, promise: Promise) {
        promise.resolve(HlsProxyRuntime.getStreamCacheStats(url, HlsHeaderCodec.decode(headers)))
    }

    @ReactMethod
    fun configureCache(options: ReadableMap?, promise: Promise) {
        val maxBytes = if (options?.hasKey("maxBytes") == true) options.getDouble("maxBytes") else null
        HlsProxyRuntime.configureCache(maxBytes)
        promise.resolve(true)
    }

    @ReactMethod
    fun clearCache(promise: Promise) {
        HlsProxyRuntime.clearCache()
        promise.resolve(true)
    }

    @ReactMethod
    fun clearPreview(promise: Promise) {
        HlsProxyRuntime.clearPreview()
        promise.resolve(true)
    }

    @ReactMethod
    fun getThumbnailUrl(url: String, headers: ReadableMap?, promise: Promise) {
        previewExecutor.execute {
            try {
                val result = HlsProxyRuntime.getThumbnailUrl(url, HlsHeaderCodec.decode(headers))
                promise.resolve(result)
            } catch (err: Throwable) {
                promise.reject("thumbnail_error", err)
            }
        }
    }

    @ReactMethod
    fun peekThumbnailUrl(url: String, headers: ReadableMap?, promise: Promise) {
        previewExecutor.execute {
            try {
                val result = HlsProxyRuntime.peekThumbnailUrl(url, HlsHeaderCodec.decode(headers))
                promise.resolve(result)
            } catch (err: Throwable) {
                promise.reject("thumbnail_error", err)
            }
        }
    }

    // LifecycleEventListener — self-heal on foreground return
    override fun onHostResume() {
        HlsProxyRuntime.onHostResume()
    }

    override fun onHostPause() {
        // NanoHTTPD can keep running in background
    }

    override fun onHostDestroy() {
        HlsProxyRuntime.onHostDestroy()
    }
}
