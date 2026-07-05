package com.margelo.nitro.video

import android.content.Context
import android.net.Uri
import androidx.media3.datasource.RawResourceDataSource
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.nitroplay.video.streaming.HlsManifestUrl
import com.nitroplay.video.streaming.HlsProxyRuntime
import com.nitroplay.video.source.HlsTransportRouteMode
import com.nitroplay.video.source.HlsTransportRoutePolicy
import java.io.File

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
  private data class RoutedConfig(
    val config: NativeNitroPlayerConfig,
    val isProxyRouteActive: Boolean
  )

  private val applicationContext: Context
    get() = NitroModules.applicationContext
      ?: throw IllegalStateException(
        "NitroModules.applicationContext has not been initialized."
      )

  private fun normalizeUri(input: String): String {
    return HybridNitroPlayerUriNormalizer.normalize(input, applicationContext)
  }

  private fun transportMode(mode: NitroSourceTransportMode?): HlsTransportRouteMode? {
    return when (mode) {
      NitroSourceTransportMode.AUTO -> HlsTransportRouteMode.AUTO
      NitroSourceTransportMode.DIRECT -> HlsTransportRouteMode.DIRECT
      NitroSourceTransportMode.PROXY -> HlsTransportRouteMode.PROXY
      null -> null
    }
  }

  private fun shouldUseHlsProxy(config: NativeNitroPlayerConfig, normalizedUri: String): Boolean {
    return HlsTransportRoutePolicy.shouldUseProxyForPlayback(
      mode = transportMode(config.transport?.mode),
      isHls = HlsManifestUrl.matches(normalizedUri),
      feedPoolEligible = config.retention?.feedPoolEligible == true
    )
  }

  private fun normalizeAndRouteConfig(config: NativeNitroPlayerConfig): RoutedConfig {
    HlsProxyRuntime.register(applicationContext)
    val normalizedUri = normalizeUri(config.uri)
    val normalizedConfig = config.copy(uri = normalizedUri)
    val shouldUseHlsProxy = shouldUseHlsProxy(normalizedConfig, normalizedUri)
    val route = if (shouldUseHlsProxy && HlsManifestUrl.matches(normalizedUri)) {
      HlsProxyRuntime.resolvePlaybackRoute(normalizedUri, normalizedConfig.headers)
    } else {
      null
    }

    return RoutedConfig(
      config = NativeNitroPlayerConfig(
        uri = route?.url ?: normalizedUri,
        headers = normalizedConfig.headers,
        metadata = normalizedConfig.metadata,
        startup = normalizedConfig.startup,
        buffer = normalizedConfig.buffer,
        retention = normalizedConfig.retention,
        transport = normalizedConfig.transport,
        preview = normalizedConfig.preview
      ),
      isProxyRouteActive = route?.isProxying == true
    )
  }

  override fun fromUri(uri: String): HybridNitroPlayerSourceSpec {
    val route = normalizeAndRouteConfig(NativeNitroPlayerConfig(
      uri = normalizeUri(uri),
      headers = null,
      metadata = null,
      startup = NitroSourceStartup.EAGER,
      buffer = null,
      retention = null,
      transport = null,
      preview = null
    ))

    return HybridNitroPlayerSource(
      config = route.config,
      isProxyRouteActive = route.isProxyRouteActive
    )
  }

  override fun fromNitroPlayerConfig(config: NativeNitroPlayerConfig): HybridNitroPlayerSourceSpec {
    val normalizedConfig = config.copy(uri = normalizeUri(config.uri))
    val route = normalizeAndRouteConfig(config)
    return HybridNitroPlayerSource(
      config = route.config,
      originalConfig = normalizedConfig,
      isProxyRouteActive = route.isProxyRouteActive
    )
  }

  override val memorySize: Long
    get() = 0
}
