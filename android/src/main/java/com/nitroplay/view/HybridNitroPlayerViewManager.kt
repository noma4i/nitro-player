package com.margelo.nitro.video

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.facebook.proguard.annotations.DoNotStrip
import com.nitroplay.video.player.NitroPlayerManager
import com.nitroplay.video.support.errors.NitroPlayerViewError
import com.nitroplay.video.support.Threading
import com.nitroplay.video.support.ListenerRegistry
import com.nitroplay.video.view.NitroPlayerView

@DoNotStrip
@OptIn(UnstableApi::class)
class HybridNitroPlayerViewManager(private val nitroId: Int): HybridNitroPlayerViewManagerSpec(), NitroPlayerViewEventsEmitter {
  private var videoView =
    NitroPlayerManager.getNitroPlayerViewWeakReferenceByNitroId(nitroId) ?: throw NitroPlayerViewError.ViewNotFound(nitroId)
  private val registry = ListenerRegistry()
  private var playerDefaults: NitroPlayerDefaults? = null
  private var assignedPlayer: HybridNitroPlayer? = null

  init {
    currentVideoView()?.eventsEmitter = this
  }

  private fun currentVideoView(): NitroPlayerView? {
    NitroPlayerManager.getNitroPlayerViewWeakReferenceByNitroId(nitroId)?.let { latest ->
      if (latest.get() !== videoView.get()) {
        videoView.get()?.eventsEmitter = null
        videoView = latest
      }
    }

    val currentView = videoView.get() ?: return null
    currentView.eventsEmitter = this
    val player = assignedPlayer
    if (player != null && currentView.hybridPlayer !== player) {
      currentView.hybridPlayer = player
      applyDefaults(player)
    }
    return currentView
  }

  private fun viewOrNull(): NitroPlayerView? {
    return NitroPlayerManager.getNitroPlayerViewWeakReferenceByNitroId(nitroId)?.get() ?: videoView.get()
  }

  private fun applyDefaults(player: HybridNitroPlayer?) {
    val defaults = playerDefaults ?: return
    val activePlayer = player ?: return

    defaults.loop?.let { activePlayer.loop = it }
    defaults.muted?.let { activePlayer.muted = it }
    defaults.volume?.let { activePlayer.volume = it }
    defaults.rate?.let { activePlayer.rate = it }
    defaults.mixAudioMode?.let { activePlayer.mixAudioMode = it }
    defaults.ignoreSilentSwitchMode?.let { activePlayer.ignoreSilentSwitchMode = it }
    defaults.playInBackground?.let { activePlayer.playInBackground = it }
    defaults.playWhenInactive?.let { activePlayer.playWhenInactive = it }
  }

  override var player: HybridNitroPlayerSpec?
    get() = viewOrNull()?.hybridPlayer
    set(value) {
      Threading.runOnMainThread {
        val hybridPlayer = value as? HybridNitroPlayer
        assignedPlayer = hybridPlayer
        currentVideoView()?.hybridPlayer = hybridPlayer
        applyDefaults(hybridPlayer)
      }
    }

  override var isAttached: Boolean
    get() = viewOrNull()?.isWindowAttached == true
    set(_) {}

  override fun enterFullscreen() {
    currentVideoView()?.enterFullscreen()
  }

  override fun exitFullscreen() {
    currentVideoView()?.exitFullscreen()
  }

  override var controls: Boolean
    get() = currentVideoView()?.useController == true
    set(value) {
      currentVideoView()?.useController = value
    }

  override var resizeMode: ResizeMode
    get() = currentVideoView()?.resizeMode ?: ResizeMode.NONE
    set(value) {
      currentVideoView()?.resizeMode = value
    }

  override var keepScreenAwake: Boolean
    get() = currentVideoView()?.keepScreenAwake == true
    set(value) {
      currentVideoView()?.keepScreenAwake = value
    }

  override var surfaceType: SurfaceType
    get() = currentVideoView()?.surfaceType ?: SurfaceType.SURFACE
    set(value) {
      currentVideoView()?.surfaceType = value
    }

  override fun setPlayerDefaults(defaults: NitroPlayerDefaults) {
    playerDefaults = defaults
    applyDefaults(currentVideoView()?.hybridPlayer)
  }

  override fun clearPlayerDefaults() {
    playerDefaults = null
  }

  // MARK: - Listener registration methods

  override fun addOnFullscreenChangeListener(listener: (Boolean) -> Unit) =
    registry.add("onFullscreenChange", listener)

  override fun addOnAttachedListener(listener: () -> Unit) =
    registry.add("onAttached", listener)

  override fun addOnDetachedListener(listener: () -> Unit) =
    registry.add("onDetached", listener)

  override fun addWillEnterFullscreenListener(listener: () -> Unit) =
    registry.add("willEnterFullscreen", listener)

  override fun addWillExitFullscreenListener(listener: () -> Unit) =
    registry.add("willExitFullscreen", listener)

  override fun clearAllListeners() {
    registry.clearAll()
  }

  // MARK: - Event emission methods (called by NitroPlayerView)

  override fun onFullscreenChange(isActive: Boolean) =
    registry.emit<(Boolean) -> Unit>("onFullscreenChange") { it(isActive) }

  override fun onAttached() =
    registry.emit<() -> Unit>("onAttached") { it() }

  override fun onDetached() =
    registry.emit<() -> Unit>("onDetached") { it() }

  override fun willEnterFullscreen() =
    registry.emit<() -> Unit>("willEnterFullscreen") { it() }

  override fun willExitFullscreen() =
    registry.emit<() -> Unit>("willExitFullscreen") { it() }

  override val memorySize: Long
    get() = 0
}

interface NitroPlayerViewEventsEmitter {
  fun onAttached()
  fun onDetached()
  fun onFullscreenChange(isActive: Boolean)
  fun willEnterFullscreen()
  fun willExitFullscreen()
}
