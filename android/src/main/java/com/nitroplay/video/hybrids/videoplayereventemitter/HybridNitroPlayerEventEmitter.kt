package com.margelo.nitro.video

import android.util.Log
import java.util.UUID

data class ListenerPair(val id: UUID, val eventName: String, val callback: Any)

class HybridNitroPlayerEventEmitter : HybridNitroPlayerEventEmitterSpec() {
  private val lock = Any()

  var listeners: MutableList<ListenerPair> = mutableListOf()

  // MARK: - Private helpers
  private fun <T : Any> addListener(eventName: String, listener: T): ListenerSubscription {
    val id = UUID.randomUUID()
    synchronized(lock) {
      listeners.add(ListenerPair(id, eventName, listener))
    }
    return ListenerSubscription {
      synchronized(lock) {
        listeners.removeAll { it.id == id }
      }
    }
  }

  private inline fun <reified T> emitEvent(eventName: String, invokeCallback: (T) -> Unit) {
    val snapshot: List<ListenerPair> = synchronized(lock) {
      listeners.filter { it.eventName == eventName }.toList()
    }

    snapshot.forEach { pair ->
      try {
        @Suppress("UNCHECKED_CAST")
        val callback = pair.callback as? T ?: run {
          Log.d(TAG, "Invalid callback type for $eventName")
          return@forEach
        }
        invokeCallback(callback)
      } catch (t: Throwable) {
        Log.d(TAG, "Error calling $eventName listener", t)
      }
    }
  }


  // MARK: - Listener registration methods

  override fun addOnBandwidthUpdateListener(listener: (BandwidthData) -> Unit) =
    addListener("onBandwidthUpdate", listener)

  override fun addOnLoadListener(listener: (onLoadData) -> Unit) =
    addListener("onLoad", listener)

  override fun addOnLoadStartListener(listener: (onLoadStartData) -> Unit) =
    addListener("onLoadStart", listener)

  override fun addOnPlaybackStateListener(listener: (PlaybackState) -> Unit) =
    addListener("onPlaybackState", listener)

  override fun addOnVolumeChangeListener(listener: (onVolumeChangeData) -> Unit) =
    addListener("onVolumeChange", listener)

  override fun clearAllListeners() {
    synchronized(lock) {
      listeners.clear()
    }
  }

  // MARK: - Event emission methods

  fun onBandwidthUpdate(data: BandwidthData) =
    emitEvent<(BandwidthData) -> Unit>("onBandwidthUpdate") { it(data) }

  fun onLoad(data: onLoadData) =
    emitEvent<(onLoadData) -> Unit>("onLoad") { it(data) }

  fun onLoadStart(data: onLoadStartData) =
    emitEvent<(onLoadStartData) -> Unit>("onLoadStart") { it(data) }

  fun onPlaybackState(state: PlaybackState) =
    emitEvent<(PlaybackState) -> Unit>("onPlaybackState") { it(state) }

  fun onVolumeChange(data: onVolumeChangeData) =
    emitEvent<(onVolumeChangeData) -> Unit>("onVolumeChange") { it(data) }

  companion object {
    const val TAG = "HybridNitroPlayerEventEmitter"
  }
}
