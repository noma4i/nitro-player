package com.margelo.nitro.video

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.NullType
import com.margelo.nitro.core.Promise
import com.nitroplay.video.streaming.HlsProxyRuntime
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

@OptIn(UnstableApi::class)
class HybridNitroStreamCache: HybridNitroStreamCacheSpec() {
  init {
    NitroModules.applicationContext?.let { HlsProxyRuntime.register(it) }
  }

  override fun prefetchLeadingSegments(url: String, headers: Map<String, String>?): Promise<Unit> {
    return Promise.async {
      NitroModules.applicationContext?.let { HlsProxyRuntime.register(it) }
      suspendCoroutine { continuation ->
        HlsProxyRuntime.prefetchLeadingSegments(
          url,
          headers,
          onComplete = { continuation.resume(Unit) },
          onError = { continuation.resumeWithException(it) }
        )
      }
    }
  }

  override fun getCacheStats(): Promise<NitroStreamCacheStats> {
    return Promise.async {
      NitroModules.applicationContext?.let { HlsProxyRuntime.register(it) }
      HlsProxyRuntime.getCacheStats().toCacheStats()
    }
  }

  override fun getStreamCacheStats(url: String, headers: Map<String, String>?): Promise<NitroStreamSourceCacheStats> {
    return Promise.async {
      NitroModules.applicationContext?.let { HlsProxyRuntime.register(it) }
      HlsProxyRuntime.getStreamCacheStats(url, headers).toStreamCacheStats()
    }
  }

  override fun getNetworkThroughputEstimate(): Promise<Variant_NullType_NitroStreamNetworkThroughputEstimate> {
    return Promise.async {
      Variant_NullType_NitroStreamNetworkThroughputEstimate.First(NullType.NULL)
    }
  }

  override fun configureCache(options: NitroStreamCacheConfig?): Promise<Boolean> {
    return Promise.async {
      NitroModules.applicationContext?.let { HlsProxyRuntime.register(it) }
      HlsProxyRuntime.configureCache(options?.maxBytes, options?.prefetchSegments)
      true
    }
  }

  override fun clearCache(): Promise<Boolean> {
    return Promise.async {
      NitroModules.applicationContext?.let { HlsProxyRuntime.register(it) }
      HlsProxyRuntime.clearCache()
      true
    }
  }

  override val memorySize: Long
    get() = 0

  private fun ReadableMap.toCacheStats(): NitroStreamCacheStats {
    return NitroStreamCacheStats(
      totalSize = numberValue("totalSize"),
      fileCount = numberValue("fileCount"),
      maxSize = numberValue("maxSize", DEFAULT_STREAM_CACHE_MAX_BYTES.toDouble())
    )
  }

  private fun ReadableMap.toStreamCacheStats(): NitroStreamSourceCacheStats {
    return NitroStreamSourceCacheStats(
      totalSize = numberValue("totalSize"),
      fileCount = numberValue("fileCount"),
      maxSize = numberValue("maxSize", DEFAULT_STREAM_CACHE_MAX_BYTES.toDouble()),
      streamSize = numberValue("streamSize"),
      streamFileCount = numberValue("streamFileCount")
    )
  }

  private fun ReadableMap.numberValue(key: String, fallback: Double = 0.0): Double {
    if (!hasKey(key) || isNull(key)) {
      return fallback
    }
    return when (getType(key)) {
      ReadableType.Number -> getDouble(key)
      else -> fallback
    }
  }

  companion object {
    private const val DEFAULT_STREAM_CACHE_MAX_BYTES = 4L * 1024L * 1024L * 1024L
  }
}
