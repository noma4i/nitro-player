package com.margelo.nitro.video

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.NullType
import com.margelo.nitro.core.Promise
import com.nitroplay.video.streaming.HlsProxyRuntime

@OptIn(UnstableApi::class)
class HybridNitroVideoPreview: HybridNitroVideoPreviewSpec() {
  init {
    NitroModules.applicationContext?.let { HlsProxyRuntime.register(it) }
  }

  override fun getThumbnailUrl(url: String, headers: Map<String, String>?): Promise<Variant_NullType_String> {
    return Promise.async {
      NitroModules.applicationContext?.let { HlsProxyRuntime.register(it) }
      nullableString(HlsProxyRuntime.getThumbnailUrl(url, headers))
    }
  }

  override fun peekThumbnailUrl(url: String, headers: Map<String, String>?): Promise<Variant_NullType_String> {
    return Promise.async {
      NitroModules.applicationContext?.let { HlsProxyRuntime.register(it) }
      nullableString(HlsProxyRuntime.peekThumbnailUrl(url, headers))
    }
  }

  override fun clearPreview(): Promise<Boolean> {
    return Promise.async {
      NitroModules.applicationContext?.let { HlsProxyRuntime.register(it) }
      HlsProxyRuntime.clearPreview()
      true
    }
  }

  override val memorySize: Long
    get() = 0

  private fun nullableString(value: String?): Variant_NullType_String {
    return if (value == null) {
      Variant_NullType_String.First(NullType.NULL)
    } else {
      Variant_NullType_String.Second(value)
    }
  }
}
