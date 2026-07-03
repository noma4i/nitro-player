package com.margelo.nitro.video

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
class HybridNitroFeedRingPlayerFactory : HybridNitroFeedRingPlayerFactorySpec() {
  @OptIn(UnstableApi::class)
  override fun createRingPlayer(): HybridNitroFeedRingPlayerSpec {
    return HybridNitroFeedRingPlayer()
  }

  override val memorySize: Long
    get() = 0
}
