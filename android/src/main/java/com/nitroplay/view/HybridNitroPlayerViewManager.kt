package com.margelo.nitro.video

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.facebook.proguard.annotations.DoNotStrip
import com.nitroplay.video.core.NitroPlayerManager
import com.nitroplay.video.core.NitroPlayerViewError
import com.nitroplay.video.core.utils.Threading
import com.nitroplay.video.core.ListenerRegistry

@DoNotStrip
@OptIn(UnstableApi::class)
class HybridNitroPlayerViewManager(nitroId: Int): HybridNitroPlayerViewManagerSpec(), NitroPlayerViewEventsEmitter {
  private var videoView =
    NitroPlayerManager.getNitroPlayerViewWeakReferenceByNitroId(nitroId) ?: throw NitroPlayerViewError.ViewNotFound(nitroId)
  private val registry = ListenerRegistry()
  private var playerDefaults: NitroPlayerDefaults? = null

  init {
    videoView.get()?.eventsEmitter = this
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
    get() {
      return Threading.runOnMainThreadSync { return@runOnMainThreadSync videoView.get()?.hybridPlayer }
    }
    set(value) {
      Threading.runOnMainThread {
        val hybridPlayer = value as? HybridNitroPlayer
        videoView.get()?.hybridPlayer = hybridPlayer
        applyDefaults(hybridPlayer)
      }
    }

  override var isAttached: Boolean
    get() = Threading.runOnMainThreadSync { videoView.get()?.isAttachedToWindow == true }
    set(_) {}

  override fun enterFullscreen() {
    videoView.get()?.enterFullscreen()
  }

  override fun exitFullscreen() {
    videoView.get()?.exitFullscreen()
  }

  override var controls: Boolean
    get() = videoView.get()?.useController == true
    set(value) {
      videoView.get()?.useController = value
    }

  override var resizeMode: ResizeMode
    get() = videoView.get()?.resizeMode ?: ResizeMode.NONE
    set(value) {
      videoView.get()?.resizeMode = value
    }

  override var keepScreenAwake: Boolean
    get() = videoView.get()?.keepScreenAwake == true
    set(value) {
      videoView.get()?.keepScreenAwake = value
    }

  override var surfaceType: SurfaceType
    get() = videoView.get()?.surfaceType ?: SurfaceType.SURFACE
    set(value) {
      videoView.get()?.surfaceType = value
    }

  override fun setPlayerDefaults(defaults: NitroPlayerDefaults) {
    playerDefaults = defaults
    applyDefaults(videoView.get()?.hybridPlayer)
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
