package com.margelo.nitro.video

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.upstream.DefaultAllocator

@UnstableApi
internal data class NitroPlayerLoadControlConfig(
  val minBufferMs: Int = DEFAULT_MIN_BUFFER_DURATION_MS,
  val maxBufferMs: Int = DEFAULT_MAX_BUFFER_DURATION_MS,
  val bufferForPlaybackMs: Int = DEFAULT_BUFFER_FOR_PLAYBACK_DURATION_MS,
  val bufferForPlaybackAfterRebufferMs: Int = DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_DURATION_MS,
  val backBufferDurationMs: Int = DEFAULT_BACK_BUFFER_DURATION_MS
) {
  fun createLoadControl(allocator: DefaultAllocator): DefaultLoadControl {
    return DefaultLoadControl.Builder()
      .setAllocator(allocator)
      .setBufferDurationsMs(
        minBufferMs,
        maxBufferMs,
        bufferForPlaybackMs,
        bufferForPlaybackAfterRebufferMs
      )
      .setBackBuffer(backBufferDurationMs, false)
      .build()
  }

  companion object {
    const val DEFAULT_MIN_BUFFER_DURATION_MS = 5000
    const val DEFAULT_MAX_BUFFER_DURATION_MS = 10000
    const val DEFAULT_BUFFER_FOR_PLAYBACK_DURATION_MS = 1000
    const val DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_DURATION_MS = 2000
    const val DEFAULT_BACK_BUFFER_DURATION_MS = 0

    fun from(bufferConfig: BufferConfig?): NitroPlayerLoadControlConfig {
      return NitroPlayerLoadControlConfig(
        minBufferMs = bufferConfig?.minBufferMs?.toInt() ?: DEFAULT_MIN_BUFFER_DURATION_MS,
        maxBufferMs = bufferConfig?.maxBufferMs?.toInt() ?: DEFAULT_MAX_BUFFER_DURATION_MS,
        bufferForPlaybackMs = bufferConfig?.bufferForPlaybackMs?.toInt()
          ?: DEFAULT_BUFFER_FOR_PLAYBACK_DURATION_MS,
        bufferForPlaybackAfterRebufferMs = bufferConfig?.bufferForPlaybackAfterRebufferMs?.toInt()
          ?: DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_DURATION_MS,
        backBufferDurationMs = bufferConfig?.backBufferDurationMs?.toInt()
          ?: DEFAULT_BACK_BUFFER_DURATION_MS
      )
    }
  }
}

@UnstableApi
internal data class NitroPlayerPlaybackConfig(
  val loadControl: NitroPlayerLoadControlConfig = NitroPlayerLoadControlConfig(),
  val preferredPeakBitRate: Int? = null
) {
  fun createLoadControl(allocator: DefaultAllocator): DefaultLoadControl {
    return loadControl.createLoadControl(allocator)
  }

  fun createTrackSelector(context: Context): DefaultTrackSelector {
    return DefaultTrackSelector(context).also { selector ->
      applyToTrackSelector(selector)
    }
  }

  fun applyToTrackSelector(selector: DefaultTrackSelector) {
    selector.setParameters(
      selector.buildUponParameters()
        .setMaxVideoBitrate(preferredPeakBitRate ?: Int.MAX_VALUE)
        .build()
    )
  }

  fun requiresPlayerRebuild(previous: NitroPlayerPlaybackConfig?): Boolean {
    return previous == null || loadControl != previous.loadControl
  }

  companion object {
    fun from(bufferConfig: BufferConfig?): NitroPlayerPlaybackConfig {
      return NitroPlayerPlaybackConfig(
        loadControl = NitroPlayerLoadControlConfig.from(bufferConfig),
        preferredPeakBitRate = bufferConfig?.preferredPeakBitRate?.toInt()
      )
    }
  }
}
