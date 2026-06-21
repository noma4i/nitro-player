package com.margelo.nitro.video

import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
class HybridNitroPlayerViewManagerFactory: HybridNitroPlayerViewManagerFactorySpec() {
  override fun createViewManager(nitroId: Double): HybridNitroPlayerViewManagerSpec {
    return HybridNitroPlayerViewManager(nitroId.toInt())
  }

  override val memorySize: Long
    get() = 0
}
