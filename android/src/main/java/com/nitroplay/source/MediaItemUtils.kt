package com.nitroplay.video.source

import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import com.margelo.nitro.video.HybridNitroPlayerSource
import com.margelo.nitro.video.LivePlaybackParams

@OptIn(UnstableApi::class)
fun createMediaItemFromVideoConfig(
  source: HybridNitroPlayerSource
): MediaItem {
  val mediaItemBuilder = MediaItem.Builder()

  mediaItemBuilder.setUri(source.config.uri)

  source.config.buffer?.livePlayback?.let { livePlaybackParams ->
    mediaItemBuilder.setLiveConfiguration(getLiveConfiguration(livePlaybackParams))
  }

  return mediaItemBuilder.build()
}

fun getLiveConfiguration(
  livePlaybackParams: LivePlaybackParams
): MediaItem.LiveConfiguration {
  val liveConfiguration = MediaItem.LiveConfiguration.Builder()

  livePlaybackParams.maxOffsetMs?.let {
    if (it >= 0) {
      liveConfiguration.setMaxOffsetMs(it.toLong())
    }
  }

  livePlaybackParams.minOffsetMs?.let {
    if (it >= 0) {
      liveConfiguration.setMinOffsetMs(it.toLong())
    }
  }

  livePlaybackParams.targetOffsetMs?.let {
    if (it >= 0) {
      liveConfiguration.setTargetOffsetMs(it.toLong())
    }
  }

  livePlaybackParams.maxPlaybackSpeed?.let {
    if (it >= 0) {
      liveConfiguration.setMaxPlaybackSpeed(it.toFloat())
    }
  }

  livePlaybackParams.minPlaybackSpeed?.let {
    if (it >= 0) {
      liveConfiguration.setMinPlaybackSpeed(it.toFloat())
    }
  }

  return liveConfiguration.build()
}
