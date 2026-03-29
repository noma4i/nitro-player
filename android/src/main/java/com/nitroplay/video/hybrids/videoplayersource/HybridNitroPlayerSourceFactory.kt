package com.margelo.nitro.video

import android.content.Context
import android.net.Uri
import androidx.media3.datasource.RawResourceDataSource
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.nitroplay.hls.HlsProxyRuntime
import java.util.Locale

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

  private fun isHlsManifest(uri: String): Boolean {
    val withoutHash = uri.substringBefore('#')
    val withoutQuery = withoutHash.substringBefore('?')
    return withoutQuery.lowercase(Locale.ROOT).endsWith(".m3u8")
  }

  private fun normalizeConfig(config: NativeNitroPlayerConfig): NativeNitroPlayerConfig {
    val normalizedUri = normalizeUri(config.uri)
    val shouldUseHlsProxy = config.advanced?.transport?.useHlsProxy != false
    val proxiedUri = if (shouldUseHlsProxy && isHlsManifest(normalizedUri)) {
      HlsProxyRuntime.getProxiedUrl(normalizedUri, config.headers)
    } else {
      normalizedUri
    }

    return NativeNitroPlayerConfig(
      uri = proxiedUri,
      headers = config.headers,
      metadata = config.metadata,
      lifecycle = config.lifecycle,
      initialization = config.initialization,
      advanced = config.advanced
    )
  }

  override fun fromUri(uri: String): HybridNitroPlayerSourceSpec {
    val config = normalizeConfig(NativeNitroPlayerConfig(
      uri = normalizeUri(uri),
      headers = null,
      metadata = null,
      lifecycle = MemoryProfile.BALANCED,
      initialization = NitroSourceInitialization.EAGER,
      advanced = null
    ))

    return HybridNitroPlayerSource(config)
  }

  override fun fromNitroPlayerConfig(config: NativeNitroPlayerConfig): HybridNitroPlayerSourceSpec {
    return HybridNitroPlayerSource(normalizeConfig(config))
  }

  override val memorySize: Long
    get() = 0
}
