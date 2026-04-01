package com.nitroplay.hls

import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
class NitroPlayStreamRuntimeModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

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
        HlsProxyRuntime.prefetchFirstSegment(url, headers, onComplete = {
            promise.resolve(true)
        }, onError = { err ->
            promise.reject("prefetch_error", err)
        })
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
        Thread {
            val result = HlsProxyRuntime.getThumbnailUrl(url, com.nitroplay.hls.HlsHeaderCodec.decode(headers))
            promise.resolve(result)
        }.start()
    }

    @ReactMethod
    fun peekThumbnailUrl(url: String, headers: ReadableMap?, promise: Promise) {
        Thread {
            val result = HlsProxyRuntime.peekThumbnailUrl(url, com.nitroplay.hls.HlsHeaderCodec.decode(headers))
            promise.resolve(result)
        }.start()
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
