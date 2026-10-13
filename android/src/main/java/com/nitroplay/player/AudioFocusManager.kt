package com.nitroplay.video.player

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.AudioFocusRequest
import android.os.Build
import androidx.annotation.OptIn
import androidx.annotation.RequiresApi
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import com.margelo.nitro.NitroModules
import com.margelo.nitro.video.HybridNitroPlayer
import com.margelo.nitro.video.MixAudioMode
import com.nitroplay.video.support.Threading
import com.nitroplay.video.support.errors.UnknownError
import com.nitroplay.video.runtime.AudioFocusEventEngine
import com.nitroplay.video.runtime.PlaybackSessionRuntime
import kotlin.getValue

@OptIn(UnstableApi::class)
class AudioFocusManager() {
  // Main-thread confined: NitroPlayerManager dispatches registration, focus callbacks
  // dispatch through Threading, and player property callers execute on the main thread.
  private val players = mutableListOf<HybridNitroPlayer>()
  private var currentMixAudioMode: MixAudioMode? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private val preDuckVolumes = mutableMapOf<HybridNitroPlayer, Float>()
  private val transientlyPausedUnboundPlayers = mutableSetOf<HybridNitroPlayer>()
  private var isDucking = false

  private val eventEngine = AudioFocusEventEngine(
    acquireSuspension = {
      val suspension = PlaybackSessionRuntime.coordinator.suspend("android-audio-focus-transient")
      suspension::release
    },
    stopCoordinated = PlaybackSessionRuntime.coordinator::stopAll,
    pauseUnboundTransient = {
      players.forEach { player ->
        if (player.hasPlaybackBinding) {
          return@forEach
        }

        player.currentMediaPlayer()?.let { mediaPlayer ->
          if (mediaPlayer.isPlaying && mediaPlayer.volume != 0f) {
            transientlyPausedUnboundPlayers += player
            mediaPlayer.pause()
          }
        }
      }
    },
    resumeUnboundTransient = {
      val pausedPlayers = transientlyPausedUnboundPlayers.toList()
      transientlyPausedUnboundPlayers.clear()
      pausedPlayers.filter { player ->
        !player.isReleased &&
          player.wantsToPlay &&
          player.hasActiveSource &&
          !player.muted &&
          player.userVolume != 0.0
      }.forEach { player ->
        player.play()
      }
    },
    stopUnbound = {
      val unboundPlayers = transientlyPausedUnboundPlayers + players.filter { player ->
        !player.hasPlaybackBinding
      }
      transientlyPausedUnboundPlayers.clear()
      unboundPlayers.forEach { player ->
        player.pause()
      }
    },
    duck = ::duckActivePlayers,
    unduck = ::unDuckActivePlayers
  )

  val appContext by lazy {
    NitroModules.applicationContext ?: throw UnknownError()
  }

  private val audioManager by lazy {
    appContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: throw UnknownError()
  }

  private val audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
    Threading.runOnMainThread {
      when (focusChange) {
        AudioManager.AUDIOFOCUS_GAIN -> {
          eventEngine.onGain()
        }
        AudioManager.AUDIOFOCUS_LOSS -> {
          eventEngine.onPermanentLoss()
          currentMixAudioMode = null
          audioFocusRequest = null
        }
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
          val mixAudioMode = determineRequiredMixMode()
          if (mixAudioMode != null && mixAudioMode != MixAudioMode.MIXWITHOTHERS) {
            eventEngine.onTransientLoss()
          }
        }
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
          val mixAudioMode = determineRequiredMixMode()
          when (mixAudioMode) {
            MixAudioMode.DONOTMIX -> eventEngine.onDuckLoss(true)
            null -> Unit
            else -> eventEngine.onDuckLoss(false)
          }
        }
      }
    }
  }

  fun resolveStaleInterruption() {
    eventEngine.resolveInterruptionIfStillActive()
  }

  fun registerPlayer(player: HybridNitroPlayer) {
    if (!players.contains(player)) {
      players.add(player)
    }
  }

  fun unregisterPlayer(player: HybridNitroPlayer) {
    players.remove(player)
    preDuckVolumes.remove(player)
    transientlyPausedUnboundPlayers.remove(player)
    if (players.isEmpty()) {
      abandonAudioFocus()
    } else {
      requestAudioFocusUpdate()
    }
  }

  fun requestAudioFocusUpdate() {
    Threading.runOnMainThread {
      if (eventEngine.blocksReconciliation) {
        return@runOnMainThread
      }

      val requiredMixMode = determineRequiredMixMode()

      if (requiredMixMode == null) {
        abandonAudioFocus()
        return@runOnMainThread
      }

      if (requiredMixMode == MixAudioMode.MIXWITHOTHERS) {
        abandonAudioFocus()
        return@runOnMainThread
      }

      if (currentMixAudioMode != requiredMixMode) {
        requestAudioFocus(requiredMixMode)
      }
    }
  }

  // Focus ownership follows the transport intent, never audibility: a muted player still plays and
  // still owns focus. Keying it off volume made every mute drop focus and every unmute re-request
  // it.
  private fun determineRequiredMixMode(): MixAudioMode? {
    val activePlayers = players.filter { player ->
      player.currentMediaPlayer()?.isPlaying == true
    }

    if (activePlayers.isEmpty()) {
      return null
    }

    val anyPlayerNeedsMixWithOthers = activePlayers.any { player ->
      player.mixAudioMode == MixAudioMode.MIXWITHOTHERS
    }

    if (anyPlayerNeedsMixWithOthers) {
      return MixAudioMode.MIXWITHOTHERS
    }

    val anyPlayerNeedsExclusiveFocus = activePlayers.any { player ->
      player.mixAudioMode == MixAudioMode.DONOTMIX
    }

    val anyPlayerNeedsDucking = activePlayers.any { player ->
      player.mixAudioMode == MixAudioMode.DUCKOTHERS
    }

    return when {
      anyPlayerNeedsExclusiveFocus -> MixAudioMode.DONOTMIX
      anyPlayerNeedsDucking -> MixAudioMode.DUCKOTHERS
      else -> MixAudioMode.AUTO
    }
  }

  private fun requestAudioFocus(mixMode: MixAudioMode) {
    val focusType = when (mixMode) {
      MixAudioMode.DONOTMIX -> AudioManager.AUDIOFOCUS_GAIN
      MixAudioMode.DUCKOTHERS -> AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
      MixAudioMode.AUTO -> AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
      MixAudioMode.MIXWITHOTHERS -> return // No focus needed for mix with others
    }

    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      requestAudioFocusNew(focusType)
    } else {
      requestAudioFocusLegacy(focusType)
    }

    if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
      currentMixAudioMode = mixMode
    } else {
      currentMixAudioMode = null
      audioFocusRequest = null
      eventEngine.onPermanentLoss()
    }
  }

  @RequiresApi(Build.VERSION_CODES.O)
  private fun requestAudioFocusNew(focusType: Int): Int {

    val request = AudioFocusRequest.Builder(focusType)
      .setAudioAttributes(
        AudioAttributes.Builder().run {
          setUsage(AudioAttributes.USAGE_MEDIA)
          setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
          build()
        }
      )
      .setOnAudioFocusChangeListener(audioFocusChangeListener)
      .build()

    audioFocusRequest = request
    return audioManager.requestAudioFocus(request)
  }

  @Suppress("DEPRECATION")
  private fun requestAudioFocusLegacy(focusType: Int): Int {
    return audioManager.requestAudioFocus(
      audioFocusChangeListener,
      AudioManager.STREAM_MUSIC,
      focusType
    )
  }

  private fun abandonAudioFocus() {
    eventEngine.onAbandoned()

    if (currentMixAudioMode != null) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        abandonAudioFocusNew()
      } else {
        abandonAudioFocusLegacy()
      }
      currentMixAudioMode = null
      audioFocusRequest = null
    }
  }

  @RequiresApi(Build.VERSION_CODES.O)
  private fun abandonAudioFocusNew() {
    audioFocusRequest?.let { request ->
      audioManager.abandonAudioFocusRequest(request)
    }
  }

  @Suppress("DEPRECATION")
  private fun abandonAudioFocusLegacy() {
    audioManager.abandonAudioFocus(audioFocusChangeListener)
  }

  private fun duckActivePlayers() {
    Threading.runOnMainThread {
      isDucking = true
      players.forEach { player ->
        player.currentMediaPlayer()?.let { mediaPlayer ->
          if (!preDuckVolumes.containsKey(player)) {
            preDuckVolumes[player] = mediaPlayer.volume
          }
          mediaPlayer.volume = mediaPlayer.volume * 0.5f
        }
      }
      isDucking = false
    }
  }

  private fun unDuckActivePlayers() {
    Threading.runOnMainThread {
      isDucking = true
      players.forEach { player ->
        player.currentMediaPlayer()?.let { mediaPlayer ->
          val originalVolume = preDuckVolumes.remove(player)
          if (originalVolume != null) {
            mediaPlayer.volume = originalVolume
          }
        }
      }
      isDucking = false
    }
  }

  fun isDucking(): Boolean = isDucking

  private fun HybridNitroPlayer.currentMediaPlayer(): ExoPlayer? = currentPlayerOrNull()

  /**
   * Returns the player's volume captured before the current duck, or null when
   * the player is not currently ducked. Callers that need to snapshot the real
   * (non-ducked) volume must prefer this over the live player.volume.
   */
  fun preDuckVolume(player: HybridNitroPlayer): Float? = preDuckVolumes[player]
}
