package com.margelo.nitro.video

import android.content.Context
import android.net.Uri
import androidx.media3.datasource.RawResourceDataSource
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.nitroplay.hls.HlsProxyRuntime
import java.io.File
import java.util.Locale

internal object HybridNitroPlayerUriNormalizer {
  fun isAndroidRawResourceName(input: String): Boolean {
    if (input.isBlank()) {
      return false
    }

    return input.all { character -> character in 'a'..'z' || character in '0'..'9' || character == '_' }
  }

  fun normalize(input: String, applicationContext: Context): String {
    val parsedUri = Uri.parse(input)

    if (parsedUri.scheme != null) {
      return parsedUri.toString()
    }

    if (File(input).isAbsolute || input.startsWith("/")) {
      return Uri.fromFile(File(input)).toString()
    }

    if (!isAndroidRawResourceName(input)) {
      return input
    }

    val resId = applicationContext.resources
      .getIdentifier(input, "raw", applicationContext.packageName)

    if (resId == 0) {
      throw IllegalArgumentException("The video resource '$input' could not be found in res/raw")
    }

    val mediaUri = RawResourceDataSource.buildRawResourceUri(resId)

    return mediaUri.toString()
  }
}

@DoNotStrip
class HybridNitroPlayerSourceFactory: HybridNitroPlayerSourceFactorySpec() {
  private val applicationContext: Context
    get() = NitroModules.applicationContext
      ?: throw IllegalStateException(
        "NitroModules.applicationContext has not been initialized."
      )

  private fun normalizeUri(input: String): String {
    return HybridNitroPlayerUriNormalizer.normalize(input, applicationContext)
  }

  private fun isHlsManifest(uri: String): Boolean {
    val withoutHash = uri.substringBefore('#')
    val withoutQuery = withoutHash.substringBefore('?')
    return withoutQuery.lowercase(Locale.ROOT).endsWith(".m3u8")
  }

  private fun normalizeConfig(config: NativeNitroPlayerConfig): NativeNitroPlayerConfig {
    val normalizedUri = normalizeUri(config.uri)
    val normalizedConfig = config.copy(uri = normalizedUri)
    val shouldUseHlsProxy = normalizedConfig.transport?.mode != NitroSourceTransportMode.DIRECT
    val route = if (shouldUseHlsProxy && isHlsManifest(normalizedUri)) {
      HlsProxyRuntime.resolvePlaybackRoute(normalizedUri, normalizedConfig.headers)
    } else {
      null
    }

    return NativeNitroPlayerConfig(
      uri = route?.url ?: normalizedUri,
      headers = normalizedConfig.headers,
      metadata = normalizedConfig.metadata,
      startup = normalizedConfig.startup,
      buffer = normalizedConfig.buffer,
      retention = normalizedConfig.retention,
      transport = normalizedConfig.transport,
      preview = normalizedConfig.preview
    )
  }

  override fun fromUri(uri: String): HybridNitroPlayerSourceSpec {
    val config = normalizeConfig(NativeNitroPlayerConfig(
      uri = normalizeUri(uri),
      headers = null,
      metadata = null,
      startup = NitroSourceStartup.EAGER,
      buffer = null,
      retention = null,
      transport = null,
      preview = null
    ))

    return HybridNitroPlayerSource(config)
  }

  override fun fromNitroPlayerConfig(config: NativeNitroPlayerConfig): HybridNitroPlayerSourceSpec {
    val normalizedConfig = config.copy(uri = normalizeUri(config.uri))
    val effectiveConfig = normalizeConfig(config)
    return HybridNitroPlayerSource(
      config = effectiveConfig,
      originalConfig = normalizedConfig,
      isProxyRouteActive = effectiveConfig.uri != normalizedConfig.uri
    )
  }

  override val memorySize: Long
    get() = 0
}
