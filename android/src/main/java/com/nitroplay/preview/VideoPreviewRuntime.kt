package com.nitroplay.video.preview

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import com.margelo.nitro.video.NitroSourcePreviewConfig
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.Future
import kotlin.math.roundToInt
import com.nitroplay.video.streaming.HlsIdentity
import com.nitroplay.video.streaming.HlsManifest
import com.nitroplay.video.streaming.HlsManifestUrl
import com.nitroplay.video.streaming.cache.HlsCacheStore
import com.nitroplay.video.support.Threading.postToMainThread

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

internal interface PreviewDecodeBackend {
  fun decodeBitmapFromUrl(url: String, headers: Map<String, String>?): Bitmap?
  fun decodeBitmapFromFile(file: File): Bitmap?
  fun fetchBytes(url: String, headers: Map<String, String>?): ByteArray?
}

private object AndroidPreviewDecodeBackend : PreviewDecodeBackend {
  override fun decodeBitmapFromUrl(url: String, headers: Map<String, String>?): Bitmap? {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(url, headers ?: emptyMap())
      VideoPreviewRuntime.grabRepresentativeFrame(retriever)
    } catch (_: Exception) {
      null
    } finally {
      try {
        retriever.release()
      } catch (_: Exception) {
      }
    }
  }

  override fun decodeBitmapFromFile(file: File): Bitmap? {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(file.absolutePath)
      VideoPreviewRuntime.grabRepresentativeFrame(retriever)
    } finally {
      try {
        retriever.release()
      } catch (_: Exception) {
      }
    }
  }

  override fun fetchBytes(url: String, headers: Map<String, String>?): ByteArray? {
    return HlsPreviewHttpClient.fetchBytes(url, headers)
  }
}

object VideoPreviewRuntime {
  private val lock = Any()
  private val executor = Executors.newFixedThreadPool(2)
  private val requestCoordinator = PreviewRequestCoordinator<String, VideoPreviewResult>()
  private var previewStore: HlsCacheStore? = null
  private var appContext: Context? = null
  private var decodeBackend: PreviewDecodeBackend = AndroidPreviewDecodeBackend
  private val FRAME_SAMPLE_OFFSETS_US = longArrayOf(0L, 500_000L, 1_000_000L, 2_000_000L, 3_000_000L)

  fun register(context: Context) {
    synchronized(lock) {
      appContext = context.applicationContext
      if (previewStore == null) {
        previewStore = HlsCacheStore(context.applicationContext)
      }
    }
  }

  fun getFirstFrame(url: String, headers: Map<String, String>?, preview: NitroSourcePreviewConfig?): VideoPreviewResult? {
    val request = startFirstFrameRequest(url, headers, preview) ?: return null
    return try {
      request.await()
    } finally {
      request.cancel()
    }
  }

  internal fun startFirstFrameRequest(url: String, headers: Map<String, String>?, preview: NitroSourcePreviewConfig?): PreviewRequest<VideoPreviewResult>? {
    val store = ensureStore() ?: return null
    val cacheKey = HlsIdentity.previewKey(url, headers, preview)

    return synchronized(lock) {
      store.getThumbnailPath(cacheKey)?.let { cached ->
        return@synchronized cachedPreviewRequest(VideoPreviewResult(uri = cached, fromCache = true))
      }

      requestCoordinator.acquire(cacheKey) {
        submitPreviewWork {
          generatePreview(store, cacheKey, url, headers, VideoPreviewProfile.from(preview))
        }
      }
    }
  }

  internal fun dispatchFirstFrameAwait(request: PreviewRequest<VideoPreviewResult>, onComplete: (VideoPreviewResult?) -> Unit): Future<*> {
    return request.onComplete { preview ->
      request.cancel()
      postToMainThread {
        onComplete(preview)
      }
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
      requestCoordinator.cancelAll()
      previewStore?.clearThumbnails()
    }
  }

  internal fun acquirePreviewRequestForTests(
    cacheKey: String,
    supplier: () -> PreviewWork<VideoPreviewResult>
  ): PreviewRequest<VideoPreviewResult> {
    return synchronized(lock) {
      requestCoordinator.acquire(cacheKey, supplier)
    }
  }

  internal fun completedPreviewWorkForTests(result: VideoPreviewResult?): PreviewWork<VideoPreviewResult> {
    return PreviewWork.completed(result)
  }

  internal fun setDecodeBackendForTests(backend: PreviewDecodeBackend?) {
    synchronized(lock) {
      decodeBackend = backend ?: AndroidPreviewDecodeBackend
    }
  }

  internal fun generatePreviewForTests(
    store: HlsCacheStore,
    cacheKey: String,
    url: String,
    headers: Map<String, String>? = null,
    profile: VideoPreviewProfile = VideoPreviewProfile(maxWidth = 480, maxHeight = 480, quality = 70)
  ): VideoPreviewResult? {
    return generatePreview(store, cacheKey, url, headers, profile)
  }

  fun resetStateForTests() {
    synchronized(lock) {
      requestCoordinator.cancelAll()
      previewStore?.close()
      previewStore = null
      appContext = null
      decodeBackend = AndroidPreviewDecodeBackend
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
    if (!HlsManifestUrl.matches(url)) {
      // Direct decode: fast path for progressive containers (mp4, mov, ...).
      decodeBackend.decodeBitmapFromUrl(url, headers)?.let { raw ->
        return storeBitmap(store, cacheKey, raw, profile)
      }
      return null
    }

    // MediaMetadataRetriever cannot open an HLS .m3u8 manifest, so decode the
    // first media segment directly into a Bitmap.
    // Emulator caveat: SwiftShader/goldfish GPUs read back a BLACK frame for an
    // MPEG-TS segment here, even though ExoPlayer renders the real video on its
    // hardware overlay. The frame decodes correctly on real devices (progressive
    // MP4 reads back fine even on the emulator -- this is TS-readback specific).
    // No in-app readback path (this, PixelCopy, TextureView.getBitmap) avoids the
    // emulator limitation, so we keep the lightweight segment decode rather than
    // pulling in media3-transformer's ExperimentalFrameExtractor for no emulator gain.
    decodeFirstHlsSegment(store, url, headers)?.let { raw ->
      return storeBitmap(store, cacheKey, raw, profile)
    }
    return null
  }

  private fun storeBitmap(
    store: HlsCacheStore,
    cacheKey: String,
    raw: Bitmap,
    profile: VideoPreviewProfile
  ): VideoPreviewResult? {
    var scaled: Bitmap? = null
    val stream = ByteArrayOutputStream()
    return try {
      scaled = scaleBitmap(raw, profile)
      scaled.compress(Bitmap.CompressFormat.JPEG, profile.quality, stream)
      val storedUri = store.putThumbnail(cacheKey, stream.toByteArray()) ?: return null
      VideoPreviewResult(uri = storedUri, fromCache = false)
    } catch (_: Exception) {
      null
    } finally {
      if (scaled != null && scaled !== raw) {
        scaled.recycle()
      }
      raw.recycle()
      try {
        stream.close()
      } catch (_: Exception) {
      }
    }
  }

  private fun decodeFirstHlsSegment(store: HlsCacheStore, url: String, headers: Map<String, String>?): Bitmap? {
    return try {
      val manifest = httpGetString(url, headers) ?: return null
      var mediaManifestUrl = url
      var mediaManifest = manifest
      if (HlsManifest.isMaster(manifest)) {
        val variant = HlsManifest.extractVariants(manifest).firstOrNull() ?: return null
        mediaManifestUrl = HlsManifest.resolveUrl(url, variant)
        mediaManifest = httpGetString(mediaManifestUrl, headers) ?: return null
      }

      val (initSeg, segments) = HlsManifest.extractLeadingSegments(mediaManifest, 1)
      val segmentRef = segments.firstOrNull() ?: return null
      val segmentUrl = HlsManifest.resolveUrl(mediaManifestUrl, segmentRef)
      val segmentBytes = cachedOrFetchBytes(store, segmentUrl, headers) ?: return null
      // Fragmented MP4 segments need the init segment (ftyp+moov) prepended.
      val initBytes = initSeg?.let { cachedOrFetchBytes(store, HlsManifest.resolveUrl(mediaManifestUrl, it), headers) }

      val temp = File.createTempFile("nitroplay-preview", null, appContext?.cacheDir)
      try {
        FileOutputStream(temp).use { out ->
          initBytes?.let { out.write(it) }
          out.write(segmentBytes)
        }
        decodeBackend.decodeBitmapFromFile(temp)
      } finally {
        temp.delete()
      }
    } catch (_: Exception) {
      null
    }
  }

  // Samples a few timestamps and returns the first non-black frame (falling back
  // to the earliest available frame), so an intro fade does not yield a black thumbnail.
  internal fun grabRepresentativeFrame(retriever: MediaMetadataRetriever): Bitmap? {
    var fallback: Bitmap? = null
    for (offsetUs in FRAME_SAMPLE_OFFSETS_US) {
      val frame = try {
        retriever.getFrameAtTime(offsetUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
      } catch (_: Exception) {
        null
      } ?: continue
      if (!isMostlyBlack(frame)) {
        fallback?.recycle()
        return frame
      }
      if (fallback == null) {
        fallback = frame
      } else {
        frame.recycle()
      }
    }
    return fallback
  }

  internal fun isMostlyBlack(bitmap: Bitmap): Boolean {
    val width = bitmap.width
    val height = bitmap.height
    if (width <= 0 || height <= 0) return true
    val steps = 8
    var maxLuma = 0
    for (i in 0 until steps) {
      for (j in 0 until steps) {
        val x = (width - 1) * i / (steps - 1)
        val y = (height - 1) * j / (steps - 1)
        val pixel = bitmap.getPixel(x, y)
        val r = (pixel shr 16) and 0xFF
        val g = (pixel shr 8) and 0xFF
        val b = pixel and 0xFF
        val luma = (r * 30 + g * 59 + b * 11) / 100
        if (luma > maxLuma) maxLuma = luma
      }
    }
    return maxLuma < 18
  }

  private fun cachedOrFetchBytes(store: HlsCacheStore, url: String, headers: Map<String, String>?): ByteArray? {
    val resourceKey = HlsIdentity.requestKey(url, headers)
    return store.get(resourceKey) ?: decodeBackend.fetchBytes(url, headers)
  }

  private fun httpGetString(url: String, headers: Map<String, String>?): String? {
    return decodeBackend.fetchBytes(url, headers)?.toString(Charsets.UTF_8)
  }

  internal fun scaleBitmap(bitmap: Bitmap, profile: VideoPreviewProfile): Bitmap {
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

  private fun submitPreviewWork(work: () -> VideoPreviewResult?): PreviewWork<VideoPreviewResult> {
    val completion = CompletableFuture<VideoPreviewResult?>()
    val submitted = executor.submit {
      try {
        if (!completion.isCancelled) {
          completion.complete(work())
        }
      } catch (_: Exception) {
        completion.complete(null)
      }
    }
    return PreviewWork(completion) {
      submitted.cancel(true)
    }
  }

  private fun cachedPreviewRequest(result: VideoPreviewResult): PreviewRequest<VideoPreviewResult> {
    return object : PreviewRequest<VideoPreviewResult> {
      @Volatile
      override var isCancelled: Boolean = false
        private set

      override fun await(): VideoPreviewResult? {
        return if (isCancelled) null else result
      }

      override fun onComplete(callback: (VideoPreviewResult?) -> Unit): Future<*> {
        return executor.submit {
          if (!isCancelled) {
            callback(result)
          }
        }
      }

      override fun cancel() {
        isCancelled = true
      }
    }
  }
}

private object HlsPreviewHttpClient {
  private const val HTTP_TIMEOUT_MS = 8000

  fun fetchBytes(url: String, headers: Map<String, String>?): ByteArray? {
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = HTTP_TIMEOUT_MS
        readTimeout = HTTP_TIMEOUT_MS
        instanceFollowRedirects = true
        headers?.forEach { (key, value) -> setRequestProperty(key, value) }
      }
      if (connection.responseCode !in 200..299) return null
      connection.inputStream.use { it.readBytes() }
    } catch (_: Exception) {
      null
    } finally {
      connection?.disconnect()
    }
  }
}
