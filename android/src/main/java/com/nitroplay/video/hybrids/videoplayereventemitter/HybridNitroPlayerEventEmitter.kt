package com.margelo.nitro.video

import com.nitroplay.video.core.ListenerRegistry

class HybridNitroPlayerEventEmitter : HybridNitroPlayerEventEmitterSpec() {
  private val registry = ListenerRegistry()

  override fun addOnBandwidthUpdateListener(listener: (BandwidthData) -> Unit) =
    registry.add("onBandwidthUpdate", listener)

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

  fun onLoad(data: onLoadData) =
    registry.emit<(onLoadData) -> Unit>("onLoad") { it(data) }

  fun onLoadStart(data: onLoadStartData) =
    registry.emit<(onLoadStartData) -> Unit>("onLoadStart") { it(data) }

  fun onPlaybackState(state: PlaybackState) =
    registry.emit<(PlaybackState) -> Unit>("onPlaybackState") { it(state) }

  fun onVolumeChange(data: onVolumeChangeData) =
    registry.emit<(onVolumeChangeData) -> Unit>("onVolumeChange") { it(data) }
}
