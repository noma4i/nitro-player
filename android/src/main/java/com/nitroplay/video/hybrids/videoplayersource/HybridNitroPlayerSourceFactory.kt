package com.margelo.nitro.video

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.datasource.RawResourceDataSource
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules

@DoNotStrip
class HybridNitroPlayerSourceFactory: HybridNitroPlayerSourceFactorySpec() {
  private val applicationContext: Context
    get() = NitroModules.applicationContext
      ?: throw IllegalStateException(
        "NitroModules.applicationContext has not been initialized."
      )

  private fun normalizeUri(input: String): String {
    val parsedUri = Uri.parse(input)

    if (parsedUri.scheme != null) {
      return parsedUri.toString()
    }

    val resId = applicationContext.resources
      .getIdentifier(input, "raw", applicationContext.packageName)

    if (resId == 0) {
      throw IllegalArgumentException("The video resource '$input' could not be found in res/raw")
    }

    val mediaUri = RawResourceDataSource.buildRawResourceUri(resId)

    return mediaUri.toString()
  }

  override fun fromUri(uri: String): HybridNitroPlayerSourceSpec {
    val config = NativeNitroPlayerConfig(
      uri = normalizeUri(uri),
      headers = null,
      metadata = null,
      lifecycle = MemoryProfile.BALANCED,
      initialization = NitroSourceInitialization.EAGER,
      advanced = null
    )

    return HybridNitroPlayerSource(config)
  }

  override fun fromNitroPlayerConfig(config: NativeNitroPlayerConfig): HybridNitroPlayerSourceSpec {
    return HybridNitroPlayerSource(config)
  }

  override val memorySize: Long
    get() = 0
}
