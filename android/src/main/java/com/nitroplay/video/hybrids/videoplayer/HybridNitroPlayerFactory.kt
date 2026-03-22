package com.margelo.nitro.video

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
class HybridNitroPlayerFactory(): HybridNitroPlayerFactorySpec() {
  @OptIn(UnstableApi::class)
  override fun createPlayer(source: HybridNitroPlayerSourceSpec): HybridNitroPlayerSpec {
    return HybridNitroPlayer(source as HybridNitroPlayerSource)
  }

  override val memorySize: Long
    get() = 0
}
