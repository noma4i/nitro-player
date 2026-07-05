package com.margelo.nitro.video

import androidx.media3.common.C
import androidx.media3.exoplayer.upstream.DefaultAllocator

internal object PlayerAllocatorPool {
  fun currentOrCreate(current: DefaultAllocator?): DefaultAllocator {
    return current ?: DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE)
  }
}

internal object PlayerInstanceReusePolicy {
  const val DEFAULT_REUSE_PLAYER_INSTANCE_FOR_SOURCE_CHANGES = true

  fun shouldRebuildForSourceChange(
    forceRebuild: Boolean,
    reuseForSourceChanges: Boolean,
    nextPlaybackConfig: NitroPlayerPlaybackConfig,
    activePlaybackConfig: NitroPlayerPlaybackConfig?,
    hasAllocator: Boolean
  ): Boolean {
    return forceRebuild ||
      !reuseForSourceChanges ||
      nextPlaybackConfig.requiresPlayerRebuild(activePlaybackConfig) ||
      !hasAllocator
  }

  fun shouldReleaseForRetentionTrim(): Boolean = true
}
