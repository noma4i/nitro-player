package com.nitroplay.video.core.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.Util
import androidx.media3.exoplayer.source.MediaSource
import androidx.core.net.toUri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.margelo.nitro.video.HybridNitroPlayerSource
import com.nitroplay.video.core.SourceError

@OptIn(UnstableApi::class)
@Throws(SourceError::class)
fun buildMediaSource(context: Context, source: HybridNitroPlayerSource, mediaItem: MediaItem): MediaSource {
  val uri = source.uri.toUri()

  val type = Util.inferContentType(uri)
  val dataSourceFactory = buildBaseDataSourceFactory(context, source)

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

  return mediaSourceFactory.createMediaSource(mediaItem)
}
