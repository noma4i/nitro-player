package com.margelo.nitro.video

import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import com.nitroplay.video.player.NitroPlayerManager
import com.nitroplay.video.view.NitroPlayerOrientationUtils

@UnstableApi
internal class NitroPlayerListenerBridge(
  private val host: HybridNitroPlayer
) {
  private data class ListenerBinding(
    val token: Long,
    val player: ExoPlayer,
    val sourceGeneration: Int,
    val playerListener: Player.Listener,
    val analyticsListener: AnalyticsListener
  )

  private val progressHandler = Handler(Looper.getMainLooper())
  private var progressRunnable: Runnable? = null
  private var bindingToken = 0L
  private var binding: ListenerBinding? = null

  companion object {
    private const val PROGRESS_UPDATE_INTERVAL_MS = 250L
  }

  fun bind(player: ExoPlayer, sourceGeneration: Int) {
    unbind()
    bindingToken += 1L
    val token = bindingToken
    val playerListener = createPlayerListener(token, player, sourceGeneration)
    val analyticsListener = createAnalyticsListener(token, player, sourceGeneration)
    binding = ListenerBinding(token, player, sourceGeneration, playerListener, analyticsListener)
    player.addListener(playerListener)
    player.addAnalyticsListener(analyticsListener)
  }

  fun unbind() {
    bindingToken += 1L
    val previousBinding = binding
    binding = null
    stopProgressUpdates()
    previousBinding?.player?.removeListener(previousBinding.playerListener)
    previousBinding?.player?.removeAnalyticsListener(previousBinding.analyticsListener)
  }

  fun stopProgressUpdates() {
    progressRunnable?.let { progressHandler.removeCallbacks(it) }
    progressRunnable = null
  }

  private fun isCurrentBinding(token: Long, expectedPlayer: ExoPlayer, expectedSourceGeneration: Int): Boolean {
    val currentBinding = binding ?: return false
    return currentBinding.token == token &&
      currentBinding.player === expectedPlayer &&
      currentBinding.sourceGeneration == expectedSourceGeneration &&
      host.currentPlayerOrNull() === expectedPlayer &&
      host.sourceGeneration == expectedSourceGeneration &&
      !host.isReleased
  }

  private fun createAnalyticsListener(
    token: Long,
    expectedPlayer: ExoPlayer,
    expectedSourceGeneration: Int
  ) = object : AnalyticsListener {
    override fun onBandwidthEstimate(
      eventTime: AnalyticsListener.EventTime,
      totalLoadTimeMs: Int,
      totalBytesLoaded: Long,
      bitrateEstimate: Long
    ) {
      if (!isCurrentBinding(token, expectedPlayer, expectedSourceGeneration)) return
      val videoFormat = expectedPlayer.videoFormat
      host.eventEmitter.onBandwidthUpdate(
        BandwidthData(
          bitrate = bitrateEstimate.toDouble(),
          width = if (videoFormat != null) videoFormat.width.toDouble() else null,
          height = if (videoFormat != null) videoFormat.height.toDouble() else null
        )
      )
    }

    override fun onRenderedFirstFrame(
      eventTime: AnalyticsListener.EventTime,
      output: Any,
      renderTimeMs: Long
    ) {
      if (!isCurrentBinding(token, expectedPlayer, expectedSourceGeneration)) return
      host.markReadyToDisplay(expectedPlayer, expectedSourceGeneration)
    }
  }

  private fun createPlayerListener(
    token: Long,
    expectedPlayer: ExoPlayer,
    expectedSourceGeneration: Int
  ) = object : Player.Listener {
    override fun onPlaybackStateChanged(playbackState: Int) {
      if (!isCurrentBinding(token, expectedPlayer, expectedSourceGeneration)) return
      when (playbackState) {
        Player.STATE_IDLE -> {
          host.isCurrentlyBuffering = false
          host.status = NitroPlayerStatus.IDLE
          host.readyToDisplay = false
          host.lastError = null
        }
        Player.STATE_BUFFERING -> {
          host.enterBuffering()
        }
        Player.STATE_READY -> {
          val isFirstLoadForGeneration = !host.hasLoadedCurrentSource
          host.markCurrentSourceLoaded()
          host.isCurrentlyBuffering = false
          host.lastError = null
          host.status = resolvePlayPauseStatus(expectedPlayer)

          if (isFirstLoadForGeneration) {
            val generalVideoFormat = expectedPlayer.videoFormat
            val selectedVideoTrackFormat = selectedVideoTrackFormat(expectedPlayer)
            val width = selectedVideoTrackFormat?.width ?: generalVideoFormat?.width ?: 0
            val height = selectedVideoTrackFormat?.height ?: generalVideoFormat?.height ?: 0
            val rotationDegrees = selectedVideoTrackFormat?.rotationDegrees ?: generalVideoFormat?.rotationDegrees

            host.eventEmitter.onLoad(
              onLoadData(
                currentTime = expectedPlayer.currentPosition / 1000.0,
                duration = if (expectedPlayer.duration == C.TIME_UNSET) Double.NaN else expectedPlayer.duration / 1000.0,
                width = width.toDouble(),
                height = height.toDouble(),
                orientation = NitroPlayerOrientationUtils.fromWHR(width, height, rotationDegrees)
              )
            )
          }
        }
        Player.STATE_ENDED -> {
          host.cancelStartupRecovery()
          host.wantsToPlay = false
          host.isCurrentlyBuffering = false
          host.status = NitroPlayerStatus.ENDED
          host.lastError = null
          stopProgressUpdates()
        }
      }

      host.emitPlaybackState()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      if (!isCurrentBinding(token, expectedPlayer, expectedSourceGeneration)) return
      super.onIsPlayingChanged(isPlaying)
      if (isPlaying) host.isCurrentlyBuffering = false
      if (expectedPlayer.playbackState == Player.STATE_READY) {
        host.status = resolvePlayPauseStatus(expectedPlayer)
      }
      if (isPlaying) {
        NitroPlayerManager.setLastPlayedPlayer(host)
        startProgressUpdates(token, expectedPlayer, expectedSourceGeneration)
      } else {
        stopProgressUpdates()
      }
      NitroPlayerManager.audioFocusManager.requestAudioFocusUpdate()
      host.emitPlaybackState()
    }

    override fun onPlayerError(error: PlaybackException) {
      if (!isCurrentBinding(token, expectedPlayer, expectedSourceGeneration)) return
      val message = error.message ?: "Unknown playback error"
      if (host.attemptStartupRecoveryIfNeeded(message)) {
        return
      }
      host.failPlayback(message)
    }

    override fun onPositionDiscontinuity(
      oldPosition: Player.PositionInfo,
      newPosition: Player.PositionInfo,
      reason: Int
    ) {
      if (!isCurrentBinding(token, expectedPlayer, expectedSourceGeneration)) return
      if (
        reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION &&
        expectedPlayer.repeatMode == Player.REPEAT_MODE_ONE
      ) {
        host.loopWrapCount += 1L
      }
      if (
        (reason == Player.DISCONTINUITY_REASON_SEEK || reason == Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT) &&
        host.status == NitroPlayerStatus.ENDED
      ) {
        host.status = NitroPlayerStatus.PAUSED
      }
      host.emitPlaybackState()
    }

    override fun onPlaybackParametersChanged(playbackParameters: PlaybackParameters) {
      if (!isCurrentBinding(token, expectedPlayer, expectedSourceGeneration)) return
      host.emitPlaybackState()
    }

    override fun onVolumeChanged(volume: Float) {
      if (!isCurrentBinding(token, expectedPlayer, expectedSourceGeneration)) return
      if (!host.muted && !NitroPlayerManager.audioFocusManager.isDucking()) {
        host.volume = volume.toDouble()
      }

      host.eventEmitter.onVolumeChange(onVolumeChangeData(
        volume = volume.toDouble(),
        muted = host.muted
      ))
    }
  }

  private fun selectedVideoTrackFormat(player: ExoPlayer) = player.currentTracks.groups
    .find { group -> group.type == C.TRACK_TYPE_VIDEO && group.isSelected }
    ?.let { selectedVideoTrackGroup ->
      val selectedIndex = (0 until selectedVideoTrackGroup.length).firstOrNull { index ->
        selectedVideoTrackGroup.isTrackSelected(index)
      } ?: return@let null
      selectedVideoTrackGroup.getTrackFormat(selectedIndex)
    }

  private fun resolvePlayPauseStatus(player: ExoPlayer): NitroPlayerStatus {
    if (player.isPlaying) return NitroPlayerStatus.PLAYING
    if (host.wantsToPlay) {
      return when (host.status) {
        NitroPlayerStatus.BUFFERING,
        NitroPlayerStatus.LOADING,
        NitroPlayerStatus.PLAYING -> host.status
        else -> NitroPlayerStatus.LOADING
      }
    }
    return NitroPlayerStatus.PAUSED
  }

  private fun startProgressUpdates(token: Long, expectedPlayer: ExoPlayer, expectedSourceGeneration: Int) {
    stopProgressUpdates()
    progressRunnable = object : Runnable {
      override fun run() {
        if (!isCurrentBinding(token, expectedPlayer, expectedSourceGeneration)) return
        if (expectedPlayer.playbackState != Player.STATE_IDLE && expectedPlayer.playbackState != Player.STATE_ENDED) {
          host.desiredCurrentTimeMs = expectedPlayer.currentPosition.coerceAtLeast(0L)
          host.emitPlaybackState()
          if (isCurrentBinding(token, expectedPlayer, expectedSourceGeneration)) {
            progressHandler.postDelayed(this, PROGRESS_UPDATE_INTERVAL_MS)
          }
        }
      }
    }
    progressHandler.post(progressRunnable ?: return)
  }
}
