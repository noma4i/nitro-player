package com.margelo.nitro.video

import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.analytics.AnalyticsListener
import com.nitroplay.video.core.NitroPlayerManager
import com.nitroplay.video.core.utils.NitroPlayerOrientationUtils

@UnstableApi
internal class NitroPlayerListenerBridge(
  private val host: HybridNitroPlayer
) {
  private val progressHandler = Handler(Looper.getMainLooper())
  private var progressRunnable: Runnable? = null

  companion object {
    private const val PROGRESS_UPDATE_INTERVAL_MS = 250L
  }

  val analyticsListener = object : AnalyticsListener {
    override fun onBandwidthEstimate(
      eventTime: AnalyticsListener.EventTime,
      totalLoadTimeMs: Int,
      totalBytesLoaded: Long,
      bitrateEstimate: Long
    ) {
      if (host.isReleased) return
      val videoFormat = host.player.videoFormat
      host.eventEmitter.onBandwidthUpdate(
        BandwidthData(
          bitrate = bitrateEstimate.toDouble(),
          width = if (videoFormat != null) videoFormat.width.toDouble() else null,
          height = if (videoFormat != null) videoFormat.height.toDouble() else null
        )
      )
    }
  }

  val playerListener = object : Player.Listener {
    override fun onPlaybackStateChanged(playbackState: Int) {
      if (host.isReleased) return
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
          host.isCurrentlyBuffering = false
          host.lastError = null
          host.status = host.resolvePlayPauseStatus()
          host.readyToDisplay = true

          val generalVideoFormat = host.player.videoFormat
          val currentTracks = host.player.currentTracks

          val selectedVideoTrackGroup = currentTracks.groups.find { group -> group.type == C.TRACK_TYPE_VIDEO && group.isSelected }
          val selectedVideoTrackFormat = if (selectedVideoTrackGroup != null && selectedVideoTrackGroup.length > 0) {
            selectedVideoTrackGroup.getTrackFormat(0)
          } else {
            null
          }

          val width = selectedVideoTrackFormat?.width ?: generalVideoFormat?.width ?: 0
          val height = selectedVideoTrackFormat?.height ?: generalVideoFormat?.height ?: 0
          val rotationDegrees = selectedVideoTrackFormat?.rotationDegrees ?: generalVideoFormat?.rotationDegrees

          host.eventEmitter.onLoad(
            onLoadData(
              currentTime = host.player.currentPosition / 1000.0,
              duration = if (host.player.duration == C.TIME_UNSET) Double.NaN else host.player.duration / 1000.0,
              width = width.toDouble(),
              height = height.toDouble(),
              orientation = NitroPlayerOrientationUtils.fromWHR(width, height, rotationDegrees)
            )
          )
        }
        Player.STATE_ENDED -> {
          host.intentResolver.onEnded()
          host.isCurrentlyBuffering = false
          host.status = NitroPlayerStatus.ENDED
          host.lastError = null
          stopProgressUpdates()
        }
      }

      host.emitPlaybackState()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      super.onIsPlayingChanged(isPlaying)
      if (isPlaying) host.isCurrentlyBuffering = false
      if (host.player.playbackState == Player.STATE_READY) {
        host.status = host.resolvePlayPauseStatus()
      }
      if (isPlaying) {
        NitroPlayerManager.setLastPlayedPlayer(host)
        startProgressUpdates()
      } else {
        if (host.player.playbackState == Player.STATE_ENDED || host.player.playbackState == Player.STATE_IDLE) {
          stopProgressUpdates()
        }
      }
      host.emitPlaybackState()
    }

    override fun onPlayerError(error: PlaybackException) {
      host.intentResolver.onError()
      host.isCurrentlyBuffering = false
      host.status = NitroPlayerStatus.ERROR
      host.readyToDisplay = false
      host.lastError = host.toPlaybackError(NitroPlayerErrorCode.UNKNOWN_UNKNOWN, error.message ?: "Unknown playback error")
      stopProgressUpdates()
      host.emitPlaybackState()
    }

    override fun onPositionDiscontinuity(
      oldPosition: Player.PositionInfo,
      newPosition: Player.PositionInfo,
      reason: Int
    ) {
      if (
        (reason == Player.DISCONTINUITY_REASON_SEEK || reason == Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT) &&
        host.status == NitroPlayerStatus.ENDED
      ) {
        host.status = NitroPlayerStatus.PAUSED
      }
      host.emitPlaybackState()
    }

    override fun onPlaybackParametersChanged(playbackParameters: PlaybackParameters) {
      host.emitPlaybackState()
    }

    override fun onVolumeChanged(volume: Float) {
      if (!host.muted && !NitroPlayerManager.audioFocusManager.isDucking()) {
        host.volume = volume.toDouble()
      }

      NitroPlayerManager.audioFocusManager.requestAudioFocusUpdate()
      host.eventEmitter.onVolumeChange(onVolumeChangeData(
        volume = volume.toDouble(),
        muted = host.muted
      ))
    }
  }

  fun startProgressUpdates() {
    stopProgressUpdates()
    progressRunnable = object : Runnable {
      override fun run() {
        if (host.player.playbackState != Player.STATE_IDLE && host.player.playbackState != Player.STATE_ENDED) {
          host.emitPlaybackState()
          progressHandler.postDelayed(this, PROGRESS_UPDATE_INTERVAL_MS)
        }
      }
    }
    progressHandler.post(progressRunnable ?: return)
  }

  fun stopProgressUpdates() {
    progressRunnable?.let { progressHandler.removeCallbacks(it) }
    progressRunnable = null
  }
}
