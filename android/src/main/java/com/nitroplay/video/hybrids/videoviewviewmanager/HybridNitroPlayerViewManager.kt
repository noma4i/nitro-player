package com.margelo.nitro.video

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.facebook.proguard.annotations.DoNotStrip
import com.nitroplay.video.core.NitroPlayerManager
import com.nitroplay.video.core.NitroPlayerViewError
import com.nitroplay.video.core.utils.Threading
import java.util.UUID

data class ViewListenerPair(
  val id: UUID,
  val eventName: String,
  val callback: Any
)

@DoNotStrip
@OptIn(UnstableApi::class)
class HybridNitroPlayerViewManager(nitroId: Int): HybridNitroPlayerViewManagerSpec(), NitroPlayerViewEventsEmitter {
  private var videoView =
    NitroPlayerManager.getNitroPlayerViewWeakReferenceByNitroId(nitroId) ?: throw NitroPlayerViewError.ViewNotFound(nitroId)
  private val listeners = mutableListOf<ViewListenerPair>()

  init {
    videoView.get()?.eventsEmitter = this
  }

  override var player: HybridNitroPlayerSpec?
    get() {
      return Threading.runOnMainThreadSync { return@runOnMainThreadSync videoView.get()?.hybridPlayer }
    }
    set(value) {
      Threading.runOnMainThread {
        videoView.get()?.hybridPlayer = value as? HybridNitroPlayer
      }
    }

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

  // MARK: - Private helpers

  private fun <T> addListener(eventName: String, listener: T): ListenerSubscription {
    val id = UUID.randomUUID()
    listeners.add(ViewListenerPair(id, eventName, listener as Any))
    return ListenerSubscription { listeners.removeAll { it.id == id } }
  }

  @Suppress("UNCHECKED_CAST")
  private fun <T> emitEvent(eventName: String, invoke: (T) -> Unit) {
    listeners.filter { it.eventName == eventName }.forEach { pair ->
      try {
        invoke(pair.callback as T)
      } catch (e: Exception) {
        println("[NitroPlay] Error calling $eventName listener: $e")
      }
    }
  }

  // MARK: - Listener registration methods

  override fun addOnFullscreenChangeListener(listener: (Boolean) -> Unit): ListenerSubscription {
    return addListener("onFullscreenChange", listener)
  }

  override fun addWillEnterFullscreenListener(listener: () -> Unit): ListenerSubscription {
    return addListener("willEnterFullscreen", listener)
  }

  override fun addWillExitFullscreenListener(listener: () -> Unit): ListenerSubscription {
    return addListener("willExitFullscreen", listener)
  }

  override fun clearAllListeners() {
    listeners.clear()
  }

  // MARK: - Event emission methods (called by NitroPlayerView)

  override fun onFullscreenChange(isActive: Boolean) {
    emitEvent<(Boolean) -> Unit>("onFullscreenChange") { it(isActive) }
  }

  override fun willEnterFullscreen() {
    emitEvent<() -> Unit>("willEnterFullscreen") { it() }
  }

  override fun willExitFullscreen() {
    emitEvent<() -> Unit>("willExitFullscreen") { it() }
  }

  override val memorySize: Long
    get() = 0
}

interface NitroPlayerViewEventsEmitter {
  fun onFullscreenChange(isActive: Boolean)
  fun willEnterFullscreen()
  fun willExitFullscreen()
}
