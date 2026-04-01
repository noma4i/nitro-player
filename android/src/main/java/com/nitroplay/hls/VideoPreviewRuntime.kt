package com.nitroplay.hls

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import com.margelo.nitro.video.NitroSourcePreviewConfig
import java.io.ByteArrayOutputStream
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import kotlin.math.roundToInt

data class VideoPreviewProfile(
  val maxWidth: Int,
  val maxHeight: Int,
  val quality: Int
) {
  companion object {
    fun from(config: NitroSourcePreviewConfig?): VideoPreviewProfile {
      return VideoPreviewProfile(
        maxWidth = (config?.maxWidth ?: 480.0).roundToInt().coerceAtLeast(1),
        maxHeight = (config?.maxHeight ?: 480.0).roundToInt().coerceAtLeast(1),
        quality = (config?.quality ?: 70.0).roundToInt().coerceIn(1, 100)
      )
    }
  }
}

data class VideoPreviewResult(
  val uri: String,
  val fromCache: Boolean
)

object VideoPreviewRuntime {
  private val lock = Any()
  private val executor = Executors.newCachedThreadPool()
  private val inflight = ConcurrentHashMap<String, Future<VideoPreviewResult?>>()
  private var previewStore: HlsCacheStore? = null
  private var appContext: Context? = null

  fun register(context: Context) {
    synchronized(lock) {
      appContext = context.applicationContext
      if (previewStore == null) {
        previewStore = HlsCacheStore(context.applicationContext)
      }
    }
  }

  fun getFirstFrame(url: String, headers: Map<String, String>?, preview: NitroSourcePreviewConfig?): VideoPreviewResult? {
    val store = ensureStore() ?: return null
    val cacheKey = HlsIdentity.previewKey(url, headers, preview)
    store.getThumbnailPath(cacheKey)?.let { return VideoPreviewResult(uri = it, fromCache = true) }

    val future = synchronized(lock) {
      store.getThumbnailPath(cacheKey)?.let { cached ->
        return VideoPreviewResult(uri = cached, fromCache = true)
      }

      inflight[cacheKey] ?: executor.submit(Callable {
        generatePreview(store, cacheKey, url, headers, VideoPreviewProfile.from(preview))
      }).also { created ->
        inflight[cacheKey] = created
      }
    }

    return try {
      future.get()
    } catch (_: Exception) {
      null
    } finally {
      inflight.remove(cacheKey, future)
    }
  }

  fun peekFirstFrame(url: String, headers: Map<String, String>?, preview: NitroSourcePreviewConfig?): VideoPreviewResult? {
    val store = ensureStore() ?: return null
    val cacheKey = HlsIdentity.previewKey(url, headers, preview)
    val cached = store.getThumbnailPath(cacheKey) ?: return null
    return VideoPreviewResult(uri = cached, fromCache = true)
  }

  fun clear() {
    synchronized(lock) {
      previewStore?.clearThumbnails()
    }
  }

  fun resetStateForTests() {
    synchronized(lock) {
      inflight.values.forEach { it.cancel(true) }
      inflight.clear()
      previewStore?.close()
      previewStore = null
      appContext = null
    }
  }

  private fun ensureStore(): HlsCacheStore? {
    synchronized(lock) {
      previewStore?.let { return it }
      val context = appContext ?: return null
      return HlsCacheStore(context).also { created ->
        previewStore = created
      }
    }
  }

  private fun generatePreview(
    store: HlsCacheStore,
    cacheKey: String,
    url: String,
    headers: Map<String, String>?,
    profile: VideoPreviewProfile
  ): VideoPreviewResult? {
    val retriever = MediaMetadataRetriever()
    try {
      if (headers.isNullOrEmpty()) {
        retriever.setDataSource(url, HashMap())
      } else {
        retriever.setDataSource(url, headers)
      }

      val rawBitmap = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        ?: return null
      val bitmap = scaleBitmap(rawBitmap, profile)
      val stream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.JPEG, profile.quality, stream)
      val storedUri = store.putThumbnail(cacheKey, stream.toByteArray()) ?: return null
      return VideoPreviewResult(uri = storedUri, fromCache = false)
    } catch (_: Exception) {
      return null
    } finally {
      try {
        retriever.release()
      } catch (_: Exception) {
      }
    }
  }

  private fun scaleBitmap(bitmap: Bitmap, profile: VideoPreviewProfile): Bitmap {
    if (bitmap.width <= profile.maxWidth && bitmap.height <= profile.maxHeight) {
      return bitmap
    }

    val scale = minOf(
      profile.maxWidth.toFloat() / bitmap.width.toFloat(),
      profile.maxHeight.toFloat() / bitmap.height.toFloat()
    )

    return Bitmap.createScaledBitmap(
      bitmap,
      (bitmap.width * scale).roundToInt().coerceAtLeast(1),
      (bitmap.height * scale).roundToInt().coerceAtLeast(1),
      true
    )
  }
}
