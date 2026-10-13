package com.margelo.nitro.video

import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.upstream.DefaultAllocator
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.nitroplay.video.support.errors.LibraryError
import com.nitroplay.video.player.PlayerAppStateSnapshot
import com.nitroplay.video.player.PlayerRetentionCoordinator
import com.nitroplay.video.player.PlayerRetentionSnapshot
import com.nitroplay.video.support.errors.PlayerError
import com.nitroplay.video.support.Threading.runOnMainThread

@UnstableApi
internal class NitroPlayerLifecycle(
  private val host: HybridNitroPlayer
) {
  private val trimHandler = Handler(Looper.getMainLooper())

  private companion object {
    // parity: iOS HybridNitroPlayerLifecycle defaultTrimDelayMs = 10000.
    private const val DEFAULT_TRIM_DELAY_MS = 10000.0
  }

  fun initializePlayer(forceRebuild: Boolean = false) {
    if (host.isReleased || !host.hasActiveSource) return
    cancelPendingTrim()

    if (NitroModules.applicationContext == null) {
      throw LibraryError.ApplicationContextNotFound
    }

    val hybridSource = host.currentHybridSource() ?: throw PlayerError.InvalidSource

    val mediaSource = hybridSource.createOrGetMediaSource()
    configurePlayerInstanceForCurrentSource(attachPlaybackListeners = true, forceRebuild = forceRebuild)

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
  }

  fun configurePlayerInstanceForCurrentSource(attachPlaybackListeners: Boolean, forceRebuild: Boolean = false) {
    val playbackConfig = NitroPlayerPlaybackConfig.from(host.bufferConfig)
    if (
      forceRebuild ||
      !host.reusePlayerInstanceForSourceChanges ||
      playbackConfig.requiresPlayerRebuild(host.activePlaybackConfig) ||
      host.allocator == null
    ) {
      replacePlayerInstance(playbackConfig, attachPlaybackListeners)
      return
    }

    host.listenerBridge.stopProgressUpdates()
    host.applyPlaybackConfig(playbackConfig)
    if (attachPlaybackListeners) {
      host.listenerBridge.bind(host.player, host.sourceGeneration)
    } else {
      host.listenerBridge.unbind()
    }
    host.player.playWhenReady = host.wantsToPlay
  }

  fun replacePlayerInstance(
    playbackConfig: NitroPlayerPlaybackConfig,
    attachPlaybackListeners: Boolean
  ) {
    host.listenerBridge.unbind()
    host.currentPlayerOrNull()?.release()
    host.allocator = DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE)
    host.player = host.createExoPlayer(playbackConfig)
    host.rebindCurrentPlayerView()
    if (attachPlaybackListeners) {
      host.listenerBridge.bind(host.player, host.sourceGeneration)
    }
    // A fresh ExoPlayer defaults to playWhenReady=false. Reconcile it to the current play
    // intent so a recreation (init/trim/re-init) that happens after the last play() never
    // strands a should-be-playing instance paused. The single choke point for recreation, so
    // every path (initializePlayer, trim, clearCurrentSourceState) stays intent-consistent.
    host.player.playWhenReady = host.wantsToPlay
  }

  private fun releasePlayerInstance() {
    host.listenerBridge.unbind()
    host.currentPlayerOrNull()?.release()
    host.allocator = null
    host.clearPlayerInstance()
    host.rebindCurrentPlayerView()
  }

  fun clearCurrentSourceState(sourceToTrim: HybridNitroPlayerSource?, beginGeneration: Boolean = true) {
    host.wantsToPlay = false
    cancelPendingTrim()
    host.cancelStartupRecovery()
    if (beginGeneration) {
      host.beginSourceGeneration()
    }
    host.listenerBridge.stopProgressUpdates()
    sourceToTrim?.sourceLoader?.cancel()
    sourceToTrim?.trimToCold()
    host.clearStoredHybridSource()
    if (host.reusePlayerInstanceForSourceChanges) {
      host.currentPlayerOrNull()?.stop()
      host.currentPlayerOrNull()?.clearMediaItems()
    } else {
      releasePlayerInstance()
    }
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

  fun resolvedOffscreenRetention(): RetentionLevel {
    if (!host.hasActiveSource) {
      return RetentionLevel.HOT
    }
    return host.currentSourceConfig()?.retention?.offscreen ?: RetentionLevel.HOT
  }

  fun resolvedPauseTrimDelayMs(): Long? {
    val delay = host.currentSourceConfig()?.retention?.trimDelayMs ?: DEFAULT_TRIM_DELAY_MS
    if (delay.isInfinite()) {
      return null
    }

    return delay.toLong().coerceAtLeast(0L)
  }

  fun currentRetentionState(): RetentionLevel {
    if (!host.hasActiveSource) {
      return RetentionLevel.COLD
    }
    return host.currentHybridSource()?.retentionState
      ?: RetentionLevel.COLD
  }

  fun trimForResourcePressure() {
    runOnMainThread {
      if (!PlayerRetentionCoordinator.shouldTrimForResourcePressure(retentionSnapshot())) {
        return@runOnMainThread
      }

      trimToColdRetention()
    }
  }

  fun scheduleOffscreenTrim() {
    cancelPendingTrim()

    if (resolvedOffscreenRetention() == RetentionLevel.HOT) {
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
      RetentionLevel.HOT -> Unit
      RetentionLevel.METADATA -> trimToMetadataRetention()
      RetentionLevel.COLD -> trimToColdRetention()
    }
  }

  fun retentionSnapshot(): PlayerRetentionSnapshot {
    return PlayerRetentionSnapshot(
      isReleased = host.isReleased,
      hasActiveSource = host.hasActiveSource,
      isPlaying = host.isPlaying,
      isAttachedToView = host.isAttachedToView(),
      wantsToPlay = host.wantsToPlay,
      isExternalPlaybackActive = false
    )
  }

  fun appStateSnapshot(): PlayerAppStateSnapshot {
    return PlayerAppStateSnapshot(
      playInBackground = host.playInBackground,
      playWhenInactive = host.playWhenInactive,
      isPlaying = host.isPlaying,
      wasAutoPaused = host.wasAutoPaused,
      isExternalPlaybackActive = false,
      wantsToPlay = host.wantsToPlay
    )
  }

  fun trimToMetadataRetention() {
    if (host.isReleased || !host.hasActiveSource) return
    val hybridSource = host.currentHybridSource() ?: return

    if (host.loadedWithSource) {
      host.currentPlayerOrNull()?.let { currentPlayer ->
        host.desiredCurrentTimeMs = currentPlayer.currentPosition
      }
      if (host.reusePlayerInstanceForSourceChanges) {
        host.listenerBridge.stopProgressUpdates()
        host.currentPlayerOrNull()?.stop()
        host.currentPlayerOrNull()?.clearMediaItems()
      } else {
        releasePlayerInstance()
      }
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
    host.currentHybridSource()?.trimToCold()
  }
}
