package com.margelo.nitro.video

import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.upstream.DefaultAllocator
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.nitroplay.video.core.LibraryError
import com.nitroplay.video.core.PlayerError
import com.nitroplay.video.core.utils.Threading.runOnMainThread

@UnstableApi
internal class NitroPlayerLifecycle(
  private val host: HybridNitroPlayer
) {
  private val trimHandler = Handler(Looper.getMainLooper())

  private companion object {
    private const val DEFAULT_MIN_BUFFER_DURATION_MS = 5000
    private const val DEFAULT_MAX_BUFFER_DURATION_MS = 10000
    private const val DEFAULT_BUFFER_FOR_PLAYBACK_DURATION_MS = 1000
    private const val DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_DURATION_MS = 2000
    private const val DEFAULT_BACK_BUFFER_DURATION_MS = 0
  }

  fun initializePlayer() {
    if (host.isReleased || !host.hasActiveSource) return
    cancelPendingTrim()

    if (NitroModules.applicationContext == null) {
      throw LibraryError.ApplicationContextNotFound
    }

    val hybridSource = host.source as? HybridNitroPlayerSource ?: throw PlayerError.InvalidSource

    host.allocator = DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE)

    val currentAllocator = host.allocator ?: return
    val bufferConfig = host.bufferConfig
    val loadControl = DefaultLoadControl.Builder()
      .setAllocator(currentAllocator)
      .setBufferDurationsMs(
        bufferConfig?.minBufferMs?.toInt() ?: DEFAULT_MIN_BUFFER_DURATION_MS,
        bufferConfig?.maxBufferMs?.toInt() ?: DEFAULT_MAX_BUFFER_DURATION_MS,
        bufferConfig?.bufferForPlaybackMs?.toInt()
          ?: DEFAULT_BUFFER_FOR_PLAYBACK_DURATION_MS,
        bufferConfig?.bufferForPlaybackAfterRebufferMs?.toInt()
          ?: DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_DURATION_MS
      )
      .setBackBuffer(
        bufferConfig?.backBufferDurationMs?.toInt()
          ?: DEFAULT_BACK_BUFFER_DURATION_MS,
        false
      )
      .build()

    val mediaSource = hybridSource.createOrGetMediaSource()

    replacePlayerInstance(loadControl, attachPlaybackListeners = true)

    host.loadedWithSource = true
    host.player.setMediaSource(mediaSource)

    if (host.desiredCurrentTimeMs > 0L) {
      host.player.seekTo(host.desiredCurrentTimeMs)
    }

    val sourceType = if (hybridSource.uri.startsWith("http")) SourceType.NETWORK else SourceType.LOCAL
    host.eventEmitter.onLoadStart(onLoadStartData(sourceType = sourceType, source = hybridSource))
    host.status = NitroPlayerStatus.LOADING
    host.readyToDisplay = false
    host.lastError = null
    host.emitPlaybackState()
    host.listenerBridge.startProgressUpdates()
  }

  fun replacePlayerInstance(
    loadControl: DefaultLoadControl,
    attachPlaybackListeners: Boolean
  ) {
    host.listenerBridge.stopProgressUpdates()
    host.player.removeListener(host.listenerBridge.playerListener)
    host.player.removeAnalyticsListener(host.listenerBridge.analyticsListener)
    host.player.release()
    host.player = host.createExoPlayer(loadControl)
    host.rebindCurrentPlayerView()
    if (attachPlaybackListeners) {
      host.player.addListener(host.listenerBridge.playerListener)
      host.player.addAnalyticsListener(host.listenerBridge.analyticsListener)
    }
  }

  fun clearCurrentSourceState(sourceToTrim: HybridNitroPlayerSource?) {
    host.wantsToPlay = false
    cancelPendingTrim()
    host.cancelStartupRecovery()
    host.beginSourceGeneration()
    host.listenerBridge.stopProgressUpdates()
    sourceToTrim?.sourceLoader?.cancel()
    sourceToTrim?.trimToCold()
    replacePlayerInstance(DefaultLoadControl.Builder().build(), attachPlaybackListeners = false)
    host.allocator = null
    host.loadedWithSource = false
    host.hasActiveSource = false
    host.desiredCurrentTimeMs = 0L
    host.readyToDisplay = false
    host.isCurrentlyBuffering = false
    host.status = NitroPlayerStatus.IDLE
    host.lastError = null
    host.emitPlaybackState()
  }

  fun resolvedPreloadLevel(): PreloadLevel {
    if (!host.hasActiveSource) {
      return PreloadLevel.NONE
    }
    return host.currentSourceConfig()?.retention?.preload ?: PreloadLevel.BUFFERED
  }

  fun resolvedOffscreenRetention(): OffscreenRetention {
    if (!host.hasActiveSource) {
      return OffscreenRetention.HOT
    }
    return host.currentSourceConfig()?.retention?.offscreen ?: OffscreenRetention.HOT
  }

  fun resolvedPauseTrimDelayMs(): Long? {
    val delay = host.currentSourceConfig()?.retention?.trimDelayMs ?: 10000.0
    if (delay.isInfinite()) {
      return null
    }

    return delay.toLong().coerceAtLeast(0L)
  }

  fun currentRetentionState(): MemoryRetentionState {
    if (!host.hasActiveSource) {
      return MemoryRetentionState.COLD
    }
    return (host.source as? HybridNitroPlayerSource)?.retentionState
      ?: MemoryRetentionState.COLD
  }

  fun isFeedProfile(): Boolean {
    if (!host.hasActiveSource) {
      return false
    }
    return host.currentSourceConfig()?.retention?.feedPoolEligible == true
  }

  fun shouldStayHotInFeedPool(): Boolean {
    if (host.isReleased) {
      return false
    }

    if (host.isPlaying || host.wantsToPlay) {
      return true
    }

    val currentView = host.currentPlayerView?.get()
    return currentView?.isAttachedToWindow == true
  }

  fun trimForFeedHotPool() {
    runOnMainThread {
      if (
        host.isReleased ||
        !isFeedProfile() ||
        shouldStayHotInFeedPool() ||
        currentRetentionState() != MemoryRetentionState.HOT
      ) {
        return@runOnMainThread
      }

      trimToMetadataRetention()
    }
  }

  fun scheduleOffscreenTrim() {
    cancelPendingTrim()

    if (resolvedOffscreenRetention() == OffscreenRetention.HOT) {
      return
    }

    val delayMs = resolvedPauseTrimDelayMs() ?: return
    val runnable = Runnable {
      trimToConfiguredRetention()
    }
    host.pendingTrimRunnable = runnable
    trimHandler.postDelayed(runnable, delayMs)
  }

  fun cancelPendingTrim() {
    host.pendingTrimRunnable?.let { trimHandler.removeCallbacks(it) }
    host.pendingTrimRunnable = null
  }

  fun trimToConfiguredRetention() {
    host.pendingTrimRunnable = null

    if (host.isReleased || host.isPlaying || host.isAttachedToView()) {
      return
    }

    when (resolvedOffscreenRetention()) {
      OffscreenRetention.HOT -> Unit
      OffscreenRetention.METADATA -> trimToMetadataRetention()
      OffscreenRetention.COLD -> trimToColdRetention()
    }
  }

  fun trimToMetadataRetention() {
    if (host.isReleased || !host.hasActiveSource) return
    val hybridSource = host.source as? HybridNitroPlayerSource ?: return

    if (host.loadedWithSource) {
      host.desiredCurrentTimeMs = host.player.currentPosition
      replacePlayerInstance(DefaultLoadControl.Builder().build(), attachPlaybackListeners = false)
      host.allocator = null
      host.loadedWithSource = false
    }

    hybridSource.trimToMetadata()
    host.status = NitroPlayerStatus.IDLE
    host.readyToDisplay = false
    host.lastError = null
    host.emitPlaybackState()
  }

  fun trimToColdRetention() {
    trimToMetadataRetention()
    (host.source as? HybridNitroPlayerSource)?.trimToCold()
  }
}
