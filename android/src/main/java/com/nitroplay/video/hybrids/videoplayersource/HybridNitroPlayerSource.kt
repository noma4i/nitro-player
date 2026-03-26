package com.margelo.nitro.video

import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.source.MediaSource
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.nitroplay.video.core.LibraryError
import com.nitroplay.video.core.player.buildMediaSource
import com.nitroplay.video.core.player.createMediaItemFromVideoConfig
import com.nitroplay.video.core.utils.SourceLoader
import com.nitroplay.video.core.utils.NitroPlayerInformationUtils

class HybridNitroPlayerSource(): HybridNitroPlayerSourceSpec() {
  override lateinit var uri: String
  override lateinit var config: NativeNitroPlayerConfig

  private var mediaItem: MediaItem? = null
  private var mediaSource: MediaSource? = null
  private val stateLock = Any()
  var retentionState: MemoryRetentionState = MemoryRetentionState.COLD
    private set

  internal val sourceLoader = SourceLoader()

  constructor(config: NativeNitroPlayerConfig) : this() {
    this.uri = config.uri
    this.config = config
  }

  private fun createOrGetMediaItem(): MediaItem {
    synchronized(stateLock) {
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
  }

  fun createOrGetMediaSource(): MediaSource {
    synchronized(stateLock) {
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
  }

  suspend fun warmMetadata() {
    sourceLoader.load {
      createOrGetMediaItem()
    }
  }

  fun trimToMetadata() {
    synchronized(stateLock) {
      createOrGetMediaItem()
      mediaSource = null
      retentionState = MemoryRetentionState.METADATA
    }
  }

  fun trimToCold() {
    synchronized(stateLock) {
      mediaSource = null
      mediaItem = null
      retentionState = MemoryRetentionState.COLD
    }
  }

  private fun estimateConfigMemoryBytes(): Long {
    var bytes = uri.toByteArray().size.toLong()

    config.headers?.forEach { (key, value) ->
      bytes += key.toByteArray().size.toLong()
      bytes += value.toByteArray().size.toLong()
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

  override fun getAssetInformationAsync(): Promise<NitroPlayerInformation> {
    return Promise.async {
      return@async sourceLoader.load {
        createOrGetMediaItem()
        NitroPlayerInformationUtils.fromUri(uri, config.headers ?: emptyMap())
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
