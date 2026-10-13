package com.margelo.nitro.video

import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.source.MediaSource
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.nitroplay.video.streaming.HlsManifestUrl
import com.nitroplay.video.streaming.HlsProxyRuntime
import com.nitroplay.video.support.errors.LibraryError
import com.nitroplay.video.source.buildMediaSource
import com.nitroplay.video.source.createMediaItemFromVideoConfig
import com.nitroplay.video.source.NitroPlayerInformationUtils
import com.nitroplay.video.source.SourceLoader
import com.nitroplay.video.support.errors.SourceError
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

class HybridNitroPlayerSource(
  config: NativeNitroPlayerConfig,
  private val originalConfig: NativeNitroPlayerConfig = config,
  routeGeneration: Int? = null
): HybridNitroPlayerSourceSpec() {
  private data class InformationTarget(
    val generation: Long,
    val config: NativeNitroPlayerConfig
  )

  private companion object {
    // Recovery is intentionally process-serial because every source can purge or restart
    // the shared HlsProxyRuntime; parallel recovery would race proxy server replacement.
    val recoveryExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  }

  private val stateLock = Any()
  private var resolvedRouteGeneration: Int? = routeGeneration
  private var currentConfig = config
  private var mediaItem: MediaItem? = null
  private var mediaSource: MediaSource? = null
  private var currentRetentionState = RetentionLevel.COLD
  private var currentGeneration = 0L

  internal val sourceLoader = SourceLoader()

  override val uri: String
    get() = synchronized(stateLock) { currentConfig.uri }

  internal val config: NativeNitroPlayerConfig
    get() = synchronized(stateLock) { currentConfig }

  val retentionState: RetentionLevel
    get() = synchronized(stateLock) { currentRetentionState }

  private fun createOrGetMediaItem(): MediaItem {
    synchronized(stateLock) {
      val currentMediaItem = mediaItem
      if (currentMediaItem != null) {
        return currentMediaItem
      }

      return createMediaItemFromVideoConfig(this).also {
        mediaItem = it
        if (currentRetentionState == RetentionLevel.COLD) {
          currentRetentionState = RetentionLevel.METADATA
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
      currentRetentionState = RetentionLevel.HOT
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
      currentRetentionState = RetentionLevel.METADATA
    }
  }

  fun trimToCold() {
    synchronized(stateLock) {
      currentGeneration += 1
      mediaSource = null
      mediaItem = null
      currentRetentionState = RetentionLevel.COLD
    }
    sourceLoader.cancel()
  }

  fun supportsStartupRecovery(): Boolean {
    if (originalConfig.transport?.mode == NitroSourceTransportMode.DIRECT) {
      return false
    }
    return HlsManifestUrl.matches(originalConfig.uri)
  }

  fun originalSourceUri(): String {
    return originalConfig.uri
  }

  fun requestLeadingSegmentPrefetch(durationSeconds: Double) {
    if (!supportsStartupRecovery()) {
      return
    }

    HlsProxyRuntime.requestLeadingSegmentPrefetchAsync(
      originalConfig.uri,
      originalConfig.headers,
      durationSeconds
    )
  }

  private fun purgePlaybackCacheSynchronously(): Boolean {
    if (!supportsStartupRecovery()) {
      return false
    }
    HlsProxyRuntime.purgeCachedSource(originalConfig.uri, originalConfig.headers)
    return true
  }

  private fun refreshPlaybackRouteForStartupRecoverySynchronously(): Boolean {
    if (!supportsStartupRecovery()) {
      return false
    }

    val resolution = HlsProxyRuntime.resolvePlaybackRoute(
      originalConfig.uri,
      originalConfig.headers
    )

    synchronized(stateLock) {
      currentGeneration += 1
      mediaSource = null
      mediaItem = null
      currentRetentionState = RetentionLevel.COLD
      currentConfig = originalConfig.copy(uri = resolution.url)
      resolvedRouteGeneration = resolution.routeGeneration
    }
    sourceLoader.cancel()

    return resolution.isProxying
  }

  /**
   * True when the resolved route no longer matches the transport it was resolved against:
   * either the bound port changed, or the route bypassed the proxy while the transport was
   * unhealthy and the proxy is available again.
   */
  internal val isRouteStale: Boolean
    get() {
      if (!supportsStartupRecovery()) {
        return false
      }
      val resolved = synchronized(stateLock) { resolvedRouteGeneration }
        ?: return HlsProxyRuntime.isTransportReady
      return resolved != HlsProxyRuntime.routeGeneration
    }

  internal fun recoverPlaybackRouteAsync(
    purgeCache: Boolean,
    trimWhenNotProxying: Boolean,
    completion: (Result<Unit>) -> Unit
  ) {
    try {
      recoveryExecutor.execute {
        completion(runCatching {
          if (purgeCache) {
            purgePlaybackCacheSynchronously()
          }
          val isProxying = refreshPlaybackRouteForStartupRecoverySynchronously()
          if (trimWhenNotProxying && !isProxying) {
            trimToCold()
          }
        })
      }
    } catch (error: RejectedExecutionException) {
      completion(Result.failure(error))
    }
  }

  internal fun purgePlaybackCacheAsync() {
    try {
      recoveryExecutor.execute {
        runCatching {
          purgePlaybackCacheSynchronously()
        }
      }
    } catch (_: RejectedExecutionException) {
    }
  }

  private fun estimateConfigMemoryBytes(config: NativeNitroPlayerConfig): Long {
    var bytes = config.uri.toByteArray().size.toLong()

    config.headers?.forEach { (key, value) ->
      bytes += key.toByteArray().size.toLong()
      bytes += value.toByteArray().size.toLong()
    }

    return bytes
  }

  override fun getAssetInformationAsync(): Promise<NitroPlayerInformation> {
    return Promise.async {
      return@async sourceLoader.load {
        val target = synchronized(stateLock) {
          createOrGetMediaItem()
          InformationTarget(currentGeneration, currentConfig)
        }
        val information = NitroPlayerInformationUtils.fromUri(
          target.config.uri,
          target.config.headers ?: emptyMap()
        )

        synchronized(stateLock) {
          if (currentGeneration != target.generation) {
            throw SourceError.Cancelled
          }
        }
        information
      }
    }
  }

  override val memorySize: Long
    get() = synchronized(stateLock) {
      var size = estimateConfigMemoryBytes(currentConfig)

      if (mediaItem != null) {
        size += 4L * 1024L
      }

      if (mediaSource != null) {
        size += 32L * 1024L
      }

      size
    }
}
