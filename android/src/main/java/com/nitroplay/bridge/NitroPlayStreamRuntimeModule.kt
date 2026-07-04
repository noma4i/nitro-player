package com.nitroplay.video.bridge

import android.view.View
import androidx.annotation.OptIn
import androidx.media3.common.Format
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.margelo.nitro.video.BufferConfig
import com.margelo.nitro.video.HybridNitroPlayer
import com.margelo.nitro.video.NitroPlayerLoadControlConfig
import com.margelo.nitro.video.NitroPlayerPlaybackConfig
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import com.nitroplay.video.streaming.HlsHeaderCodec
import com.nitroplay.video.streaming.HlsProxyRuntime
import com.nitroplay.video.player.NitroPlayerManager
import com.nitroplay.video.support.Threading.runOnMainThreadSync
import com.nitroplay.video.view.TextureMatteCropResult

@OptIn(UnstableApi::class)
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
    fun prefetchLeadingSegments(url: String, headers: ReadableMap?, promise: Promise) {
        try {
            HlsProxyRuntime.prefetchLeadingSegments(url, HlsHeaderCodec.decode(headers), onComplete = {
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
    fun getStreamVariants(url: String, headers: ReadableMap?, promise: Promise) {
        previewExecutor.execute {
            try {
                promise.resolve(HlsProxyRuntime.getStreamVariants(url, HlsHeaderCodec.decode(headers)))
            } catch (err: Throwable) {
                promise.reject("variants_error", err)
            }
        }
    }

    @ReactMethod
    fun getPlayersDiagnostics(promise: Promise) {
        try {
            promise.resolve(runOnMainThreadSync { playersDiagnostics() })
        } catch (err: Throwable) {
            promise.reject("players_diagnostics_error", err)
        }
    }

    @ReactMethod
    fun configureCache(options: ReadableMap?, promise: Promise) {
        val maxBytes = if (options?.hasKey("maxBytes") == true) options.getDouble("maxBytes") else null
        val prefetchSegments = if (options?.hasKey("prefetchSegments") == true) options.getDouble("prefetchSegments") else null
        HlsProxyRuntime.configureCache(maxBytes, prefetchSegments)
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

    // LifecycleEventListener self-heals on foreground return.
    override fun onHostResume() {
        HlsProxyRuntime.onHostResume()
    }

    override fun onHostPause() {
        // NanoHTTPD can keep running in background
    }

    override fun onHostDestroy() {
        HlsProxyRuntime.onHostDestroy()
    }

    private fun playersDiagnostics(): WritableMap {
        return Arguments.createMap().apply {
            putDouble("capturedAt", System.currentTimeMillis().toDouble())
            putArray("players", Arguments.createArray().apply {
                NitroPlayerManager.registeredPlayers().forEach { player ->
                    pushMap(playerDiagnostics(player))
                }
            })
            putArray("proxyLedger", Arguments.createArray())
        }
    }

    private fun playerDiagnostics(player: HybridNitroPlayer): WritableMap {
        val currentPlayer = player.currentPlayerOrNull()
        return Arguments.createMap().apply {
            putBoolean("automaticallyWaitsToMinimizeStalling", false)
            putInt("playbackWatchdogAttempts", player.playbackWatchdogAttemptCount)
            putString("cachedTimeControlStatus", playbackStateName(currentPlayer?.playbackState))
            putNullableString("sourceUri", player.currentHybridSource()?.previewSourceUri())
            putNullableString("currentItemUrl", currentPlayer?.currentMediaItem?.localConfiguration?.uri?.toString())
            putNullableMap("sourceBuffer", sourceBufferDiagnostics(player.bufferConfig))
            putNullableMap("activePlaybackConfig", playbackConfigDiagnostics(player.activePlaybackConfig))
            putNullableDouble("preferredPeakBitRate", player.activePlaybackConfig?.preferredPeakBitRate?.toDouble())
            putInt("timeControlStatus", currentPlayer?.playbackState ?: Player.STATE_IDLE)
            putDouble("rate", currentPlayer?.playbackParameters?.speed?.toDouble() ?: 0.0)
            putNull("accessLog")
            putNullableMap("selectedVideoTrack", selectedVideoTrackDiagnostics(player.selectedVideoTrackFormat()))
            putNullableMap("playerView", playerViewDiagnostics(player))
        }
    }

    private fun sourceBufferDiagnostics(bufferConfig: BufferConfig?): WritableMap? {
        if (bufferConfig == null) {
            return null
        }
        return Arguments.createMap().apply {
            putNullableDouble("minBufferMs", bufferConfig.minBufferMs)
            putNullableDouble("maxBufferMs", bufferConfig.maxBufferMs)
            putNullableDouble("bufferForPlaybackMs", bufferConfig.bufferForPlaybackMs)
            putNullableDouble("bufferForPlaybackAfterRebufferMs", bufferConfig.bufferForPlaybackAfterRebufferMs)
            putNullableDouble("backBufferDurationMs", bufferConfig.backBufferDurationMs)
            putNullableDouble("preferredForwardBufferDurationMs", bufferConfig.preferredForwardBufferDurationMs)
            putNullableDouble("preferredPeakBitRate", bufferConfig.preferredPeakBitRate)
        }
    }

    private fun playbackConfigDiagnostics(playbackConfig: NitroPlayerPlaybackConfig?): WritableMap? {
        if (playbackConfig == null) {
            return null
        }
        return Arguments.createMap().apply {
            putNullableDouble("preferredPeakBitRate", playbackConfig.preferredPeakBitRate?.toDouble())
            putMap("loadControl", loadControlDiagnostics(playbackConfig.loadControl))
        }
    }

    private fun loadControlDiagnostics(loadControl: NitroPlayerLoadControlConfig): WritableMap {
        return Arguments.createMap().apply {
            putInt("minBufferMs", loadControl.minBufferMs)
            putInt("maxBufferMs", loadControl.maxBufferMs)
            putInt("bufferForPlaybackMs", loadControl.bufferForPlaybackMs)
            putInt("bufferForPlaybackAfterRebufferMs", loadControl.bufferForPlaybackAfterRebufferMs)
            putInt("backBufferDurationMs", loadControl.backBufferDurationMs)
        }
    }

    private fun selectedVideoTrackDiagnostics(format: Format?): WritableMap? {
        if (format == null) {
            return null
        }
        return Arguments.createMap().apply {
            putNullableInt("width", if (format.width != Format.NO_VALUE) format.width else null)
            putNullableInt("height", if (format.height != Format.NO_VALUE) format.height else null)
            putNullableInt("bitrate", if (format.bitrate != Format.NO_VALUE) format.bitrate else null)
            putNullableString("codecs", format.codecs)
        }
    }

    private fun playerViewDiagnostics(player: HybridNitroPlayer): WritableMap? {
        val playerView = player.currentPlayerView?.get() ?: return null
        val nitroPlayerView = player.currentNitroPlayerView?.get()
        val contentFrame = playerView.findViewById<AspectRatioFrameLayout>(androidx.media3.ui.R.id.exo_content_frame)
        return Arguments.createMap().apply {
            putInt("width", playerView.width)
            putInt("height", playerView.height)
            putInt("resizeMode", playerView.resizeMode)
            putNullableMap("contentFrame", viewBoundsDiagnostics(contentFrame))
            putNullableMap("matteCrop", matteCropDiagnostics(nitroPlayerView?.matteCropDiagnostics))
        }
    }

    private fun matteCropDiagnostics(crop: TextureMatteCropResult?): WritableMap? {
        if (crop == null) {
            return null
        }
        return Arguments.createMap().apply {
            putDouble("scale", crop.scale.toDouble())
            putDouble("activeTopFraction", crop.activeTopFraction.toDouble())
            putDouble("activeBottomFraction", crop.activeBottomFraction.toDouble())
            putDouble("activeHeightFraction", crop.activeHeightFraction.toDouble())
            putDouble("activeCenterYFraction", crop.activeCenterYFraction.toDouble())
            putInt("sampleWidth", crop.sampleWidth)
            putInt("sampleHeight", crop.sampleHeight)
        }
    }

    private fun viewBoundsDiagnostics(view: View?): WritableMap? {
        if (view == null) {
            return null
        }
        return Arguments.createMap().apply {
            putInt("width", view.width)
            putInt("height", view.height)
            putInt("left", view.left)
            putInt("top", view.top)
            putInt("right", view.right)
            putInt("bottom", view.bottom)
        }
    }

    private fun playbackStateName(playbackState: Int?): String {
        return when (playbackState) {
            Player.STATE_BUFFERING -> "buffering"
            Player.STATE_READY -> "ready"
            Player.STATE_ENDED -> "ended"
            Player.STATE_IDLE,
            null -> "idle"
            else -> "unknown"
        }
    }

    private fun WritableMap.putNullableString(key: String, value: String?) {
        if (value == null) putNull(key) else putString(key, value)
    }

    private fun WritableMap.putNullableDouble(key: String, value: Double?) {
        if (value == null) putNull(key) else putDouble(key, value)
    }

    private fun WritableMap.putNullableInt(key: String, value: Int?) {
        if (value == null) putNull(key) else putInt(key, value)
    }

    private fun WritableMap.putNullableMap(key: String, value: WritableMap?) {
        if (value == null) putNull(key) else putMap(key, value)
    }
}
