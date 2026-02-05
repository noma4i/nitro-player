package com.margelo.nitro.video

import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.drm.DrmSessionManager
import androidx.media3.exoplayer.source.MediaSource
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.twg.video.core.LibraryError
import com.twg.video.core.player.DRMManagerSpec
import com.twg.video.core.player.buildMediaSource
import com.twg.video.core.player.createMediaItemFromVideoConfig
import com.twg.video.core.utils.SourceLoader
import com.twg.video.core.utils.VideoInformationUtils

class HybridVideoPlayerSource(): HybridVideoPlayerSourceSpec() {
  override lateinit var uri: String
  override lateinit var config: NativeVideoConfig

  private var mediaItem: MediaItem? = null
  private var mediaSource: MediaSource? = null
  var retentionState: MemoryRetentionState = MemoryRetentionState.COLD
    private set

  var drmManager: DRMManagerSpec? = null

  @UnstableApi
  var drmSessionManager: DrmSessionManager? = null

  internal val sourceLoader = SourceLoader()

  constructor(config: NativeVideoConfig) : this() {
    this.uri = config.uri
    this.config = config
  }

  private fun createOrGetMediaItem(): MediaItem {
    val currentMediaItem = mediaItem
    if (currentMediaItem != null) {
      return currentMediaItem
    }

    return createMediaItemFromVideoConfig(this).also {
      mediaItem = it
      if (retentionState == MemoryRetentionState.COLD) {
        retentionState = MemoryRetentionState.METADATA
      }
    }
  }

  fun createOrGetMediaSource(): MediaSource {
    val currentMediaSource = mediaSource
    if (currentMediaSource != null) {
      return currentMediaSource
    }

    val nextMediaItem = createOrGetMediaItem()

    val nextMediaSource = NitroModules.applicationContext?.let {
      buildMediaSource(
        context = it,
        source = this,
        nextMediaItem
      )
    } ?: run {
      throw LibraryError.ApplicationContextNotFound
    }

    mediaSource = nextMediaSource
    retentionState = MemoryRetentionState.HOT
    return nextMediaSource
  }

  suspend fun warmMetadata() {
    sourceLoader.load {
      createOrGetMediaItem()
    }
  }

  fun trimToMetadata() {
    createOrGetMediaItem()
    mediaSource = null
    retentionState = MemoryRetentionState.METADATA
  }

  fun trimToCold() {
    mediaSource = null
    mediaItem = null
    retentionState = MemoryRetentionState.COLD
  }

  private fun estimateConfigMemoryBytes(): Long {
    var bytes = uri.toByteArray().size.toLong()

    config.headers?.forEach { (key, value) ->
      bytes += key.toByteArray().size.toLong()
      bytes += value.toByteArray().size.toLong()
    }

    config.externalSubtitles?.forEach { subtitle ->
      bytes += subtitle.uri.toByteArray().size.toLong()
      bytes += subtitle.label.toByteArray().size.toLong()
      bytes += subtitle.language.toByteArray().size.toLong()
    }

    config.metadata?.let { metadata ->
      bytes += metadata.title?.toByteArray()?.size?.toLong() ?: 0L
      bytes += metadata.subtitle?.toByteArray()?.size?.toLong() ?: 0L
      bytes += metadata.description?.toByteArray()?.size?.toLong() ?: 0L
      bytes += metadata.artist?.toByteArray()?.size?.toLong() ?: 0L
      bytes += metadata.imageUri?.toByteArray()?.size?.toLong() ?: 0L
    }

    return bytes
  }

  override fun getAssetInformationAsync(): Promise<VideoInformation> {
    return Promise.async {
      return@async sourceLoader.load {
        createOrGetMediaItem()
        VideoInformationUtils.fromUri(uri, config.headers ?: emptyMap())
      }
    }
  }

  override val memorySize: Long
    get() {
      var size = estimateConfigMemoryBytes()

      if (mediaItem != null) {
        size += 4L * 1024L
      }

      if (mediaSource != null) {
        size += 32L * 1024L
      }

      return size
    }
}
