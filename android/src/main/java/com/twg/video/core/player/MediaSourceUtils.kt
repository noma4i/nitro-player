package com.twg.video.core.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.util.Util
import androidx.media3.exoplayer.source.MediaSource
import com.margelo.nitro.video.HybridVideoPlayerSourceSpec
import androidx.core.net.toUri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.drm.DrmSessionManager
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MergingMediaSource
import com.margelo.nitro.video.HybridVideoPlayerSource
import com.twg.video.core.LibraryError
import com.twg.video.core.SourceError

@OptIn(UnstableApi::class)
@Throws(SourceError::class)
fun buildMediaSource(context: Context, source: HybridVideoPlayerSource, mediaItem: MediaItem): MediaSource {
  val uri = source.uri.toUri()

  // Explanation:
  // 1. Remove query params from uri to avoid getting false extension
  // 2. Get extension from uri
  val type = Util.inferContentType(uri)
  val dataSourceFactory = buildBaseDataSourceFactory(context, source)

  if (!source.config.externalSubtitles.isNullOrEmpty()) {
    return buildExternalSubtitlesMediaSource(context, source)
  }

  val mediaSourceFactory: MediaSource.Factory = when (type) {
    C.CONTENT_TYPE_DASH -> {
      DashMediaSource.Factory(dataSourceFactory)
    }
    C.CONTENT_TYPE_HLS -> {
      HlsMediaSource.Factory(dataSourceFactory)
    }
    C.CONTENT_TYPE_OTHER -> {
      DefaultMediaSourceFactory(context)
        .setDataSourceFactory(dataSourceFactory)
    }
    else -> {
      throw SourceError.UnsupportedContentType(source.uri)
    }
  }

  source.config.drm?.let {
    val drmSessionManager = source.drmSessionManager ?: throw LibraryError.DRMPluginNotFound
    mediaSourceFactory.setDrmSessionManagerProvider { drmSessionManager }
  }

  return mediaSourceFactory.createMediaSource(mediaItem)
}

@OptIn(UnstableApi::class)
fun buildExternalSubtitlesMediaSource(context: Context, source: HybridVideoPlayerSource): MediaSource {
  val dataSourceFactory = buildBaseDataSourceFactory(context, source)

  val mediaItemBuilder = MediaItem.Builder()
    .setUri(source.uri.toUri())
    .setSubtitleConfigurations(getSubtitlesConfiguration(source.config))

  source.config.metadata?.let { metadata ->
    mediaItemBuilder.setMediaMetadata(getCustomMetadata(metadata))
  }

  val mediaSourceFactory = DefaultMediaSourceFactory(context)
    .setDataSourceFactory(dataSourceFactory)

  if (source.config.drm != null) {
    val drmManager = source.drmManager ?: throw LibraryError.DRMPluginNotFound
    val drmSessionManager = drmManager as? DrmSessionManager ?: throw LibraryError.DRMPluginNotFound

    mediaSourceFactory.setDrmSessionManagerProvider {
      drmSessionManager
    }

    val drmConfiguration = drmManager.getDRMConfiguration(source.config.drm!!)
    mediaItemBuilder.setDrmConfiguration(drmConfiguration)
  }

  return mediaSourceFactory.createMediaSource(mediaItemBuilder.build())
}


