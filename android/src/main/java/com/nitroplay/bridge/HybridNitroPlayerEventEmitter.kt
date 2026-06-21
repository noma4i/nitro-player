package com.margelo.nitro.video

import com.nitroplay.video.core.ListenerRegistry

class HybridNitroPlayerEventEmitter : HybridNitroPlayerEventEmitterSpec() {
  private val registry = ListenerRegistry()
  private var latestFirstFrame: onFirstFrameData? = null
  var onFirstFrameListenerAdded: (() -> Unit)? = null

  override fun addOnBandwidthUpdateListener(listener: (BandwidthData) -> Unit) =
    registry.add("onBandwidthUpdate", listener)

  override fun addOnErrorListener(listener: (PlaybackError) -> Unit) =
    registry.add("onError", listener)

  override fun addOnFirstFrameListener(listener: (onFirstFrameData) -> Unit) =
    registry.add("onFirstFrame", listener).also {
      latestFirstFrame?.let(listener)
      if (latestFirstFrame == null) {
        onFirstFrameListenerAdded?.invoke()
      }
    }

  override fun addOnLoadListener(listener: (onLoadData) -> Unit) =
    registry.add("onLoad", listener)

  override fun addOnLoadStartListener(listener: (onLoadStartData) -> Unit) =
    registry.add("onLoadStart", listener)

  override fun addOnPlaybackStateListener(listener: (PlaybackState) -> Unit) =
    registry.add("onPlaybackState", listener)

  override fun addOnVolumeChangeListener(listener: (onVolumeChangeData) -> Unit) =
    registry.add("onVolumeChange", listener)

  override fun clearAllListeners() {
    registry.clearAll()
  }

  fun onBandwidthUpdate(data: BandwidthData) =
    registry.emit<(BandwidthData) -> Unit>("onBandwidthUpdate") { it(data) }

  fun onError(error: PlaybackError) =
    registry.emit<(PlaybackError) -> Unit>("onError") { it(error) }

  fun onFirstFrame(data: onFirstFrameData) {
    latestFirstFrame = data
    registry.emit<(onFirstFrameData) -> Unit>("onFirstFrame") { it(data) }
  }

  fun onLoad(data: onLoadData) =
    registry.emit<(onLoadData) -> Unit>("onLoad") { it(data) }

  fun onLoadStart(data: onLoadStartData) =
    registry.emit<(onLoadStartData) -> Unit>("onLoadStart") { it(data) }

  fun onPlaybackState(state: PlaybackState) =
    registry.emit<(PlaybackState) -> Unit>("onPlaybackState") { it(state) }

  fun onVolumeChange(data: onVolumeChangeData) =
    registry.emit<(onVolumeChangeData) -> Unit>("onVolumeChange") { it(data) }

  fun resetStickyState() {
    latestFirstFrame = null
  }

  fun hasOnFirstFrameListeners(): Boolean {
    return registry.hasListeners("onFirstFrame")
  }
}
