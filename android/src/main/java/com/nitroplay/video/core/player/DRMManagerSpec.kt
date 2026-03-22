package com.nitroplay.video.core.player

import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.drm.DrmSessionManager
import com.margelo.nitro.video.NativeDrmParams

@UnstableApi
interface DRMManagerSpec {
  fun getDRMConfiguration(drmParams: NativeDrmParams): MediaItem.DrmConfiguration
  fun buildDrmSessionManager(drmParams: NativeDrmParams): DrmSessionManager
}
