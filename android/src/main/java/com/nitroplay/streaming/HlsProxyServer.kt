package com.nitroplay.video.streaming

import android.content.Context
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.RejectedExecutionException
import com.nitroplay.video.streaming.cache.HlsCacheBudget
import com.nitroplay.video.streaming.cache.HlsCacheStore

class HlsProxyServer(
    private val port: Int,
    private val context: Context,
    maxCacheBytes: Long = HlsCacheBudget.DEFAULT_MAX_BYTES,
    onStreamEvicted: (String) -> Unit = {}
) : NanoHTTPD("127.0.0.1", port) {
    companion object {
        private const val TAG = "NitroPlayHlsProxy"
        private val RETRY_DELAYS_MS = longArrayOf(100L, 300L)
        // Upstream segment/manifest fetch timeout. parity-divergent: iOS HlsProxyServerController uses 10s.
        private const val FETCH_TIMEOUT_MS = 12_000
        // Application-level probe timeout. A listening socket is not proof of service.
        private const val PROBE_TIMEOUT_MS = 2_000
    }

    val cacheStore = HlsCacheStore(context, maxCacheBytes, onStreamEvicted)
    private val executor = Executors.newSingleThreadExecutor()
    private val prefetchTasks = mutableMapOf<String, Future<*>>()

    // Set before tearing down executor/cacheStore so in-flight prefetch/segment
    // tasks skip cache writes instead of racing a closed store.
    @Volatile
    private var closed = false

    // The OS-assigned bound port (NanoHTTPD resolves port 0 to an ephemeral port),
    // not the requested one, so proxied URLs target the actual listening socket.
    fun listeningPort(): Int = getListeningPort()

    /**
     * Application-level liveness probe: true only when the server actually answers an HTTP
     * request. Blocking network call - never call from the main thread.
     */
    fun respondsToProbe(): Boolean {
        if (closed) return false
        val boundPort = listeningPort()
        if (boundPort <= 0) return false
        return try {
            val connection = URL("http://127.0.0.1:$boundPort/hls/probe").openConnection() as HttpURLConnection
            connection.connectTimeout = PROBE_TIMEOUT_MS
            connection.readTimeout = PROBE_TIMEOUT_MS
            connection.requestMethod = "GET"
            try {
                connection.responseCode == HttpURLConnection.HTTP_OK
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            false
        }
    }

    override fun stop() {
        closed = true
        super.stop()
        executor.shutdownNow()
        cacheStore.close()
    }

    private fun putToCache(resourceKey: String, data: ByteArray, streamKey: String?) {
        if (closed) return
        try {
            cacheStore.put(resourceKey, data, streamKey)
        } catch (e: Exception) {
            Log.w(TAG, "cacheStore.put after close ignored", e)
        }
    }

    override fun serve(session: IHTTPSession): Response {
        return try {
            when (session.uri) {
                "/hls/manifest.m3u8" -> handleManifest(session)
                "/hls/segment" -> handleSegment(session)
                "/hls/probe" -> newFixedLengthResponse(Response.Status.OK, "text/plain", "ok")
                else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found")
            }
        } catch (e: Exception) {
            Log.e(TAG, "serve error", e)
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Error")
        }
    }

    fun prefetch(
        url: String,
        headers: Map<String, String>?,
        durationSeconds: Double,
        onComplete: () -> Unit,
        onError: (Throwable) -> Unit,
        visitedUrls: MutableSet<String> = mutableSetOf(),
        streamKey: String = HlsIdentity.requestKey(url, headers)
    ) {
        synchronized(prefetchTasks) {
            prefetchTasks.remove(streamKey)?.cancel(false)
            lateinit var future: Future<*>
            try {
                future = executor.submit {
                    try {
                        runPrefetch(url, headers, durationSeconds, onComplete, onError, visitedUrls, streamKey)
                    } finally {
                        synchronized(prefetchTasks) {
                            if (prefetchTasks[streamKey] === future) {
                                prefetchTasks.remove(streamKey)
                            }
                        }
                    }
                }
                prefetchTasks[streamKey] = future
            } catch (e: RejectedExecutionException) {
                onError(e)
            }
        }
    }

    fun cancelPrefetch(streamKey: String): Boolean {
        return synchronized(prefetchTasks) {
            prefetchTasks.remove(streamKey)?.cancel(false) == true
        }
    }

    private fun runPrefetch(
        url: String,
        headers: Map<String, String>?,
        durationSeconds: Double,
        onComplete: () -> Unit,
        onError: (Throwable) -> Unit,
        visitedUrls: MutableSet<String>,
        streamKey: String
    ) {
            try {
                val manifestKey = HlsIdentity.requestKey(url, headers)
                if (manifestKey in visitedUrls) { onComplete(); return }
                visitedUrls.add(manifestKey)

                val manifest = fetchText(url, headers)
                if (HlsManifest.isMaster(manifest)) {
                    val variants = HlsManifest.extractVariants(manifest)
                    if (variants.isNotEmpty()) {
                        val resolved = HlsManifest.resolveUrl(url, variants[0])
                        prefetch(resolved, headers, durationSeconds, onComplete, onError, visitedUrls, streamKey)
                        return
                    }
                }
                val (initSeg, segments) = HlsManifest.extractLeadingSegments(manifest, durationSeconds)
                val seenResources = mutableSetOf<String>()
                if (initSeg != null) {
                    val resolved = HlsManifest.resolveUrl(url, initSeg)
                    prefetchResource(resolved, headers, streamKey, seenResources)
                }
                segments.forEach { segment ->
                    val resolved = HlsManifest.resolveUrl(url, segment)
                    prefetchResource(resolved, headers, streamKey, seenResources)
                }
                onComplete()
            } catch (e: Exception) {
                onError(e)
            }
    }

    private fun prefetchResource(
        url: String,
        headers: Map<String, String>?,
        streamKey: String,
        seenResources: MutableSet<String>
    ) {
        if (!seenResources.add(url)) {
            return
        }

        val resourceKey = HlsIdentity.requestKey(url, headers)
        if (!cacheStore.has(resourceKey)) {
            val data = fetchData(url, headers)
            putToCache(resourceKey, data, streamKey)
        }
    }

    private fun handleManifest(session: IHTTPSession): Response {
        val url = HlsHeaderCodec.normalizeParam(session.parameters["url"]?.firstOrNull())
            ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Missing url")
        val headers = HlsHeaderCodec.decode(session.parameters["headers"]?.firstOrNull())
        val streamKey = HlsHeaderCodec.normalizeParam(session.parameters["streamKey"]?.firstOrNull()) ?: url
        return try {
            val manifest = fetchText(url, headers, useCaches = false)
            validateManifest(manifest)
            val rewritten = if (HlsManifest.isMaster(manifest)) {
                HlsManifest.rewriteMaster(manifest, url, headers, listeningPort(), streamKey)
            } else {
                HlsManifest.rewriteMedia(manifest, url, headers, listeningPort(), streamKey)
            }
            validateManifest(rewritten)
            val data = rewritten.toByteArray(Charsets.UTF_8)
            val response = newFixedLengthResponse(Response.Status.OK, "application/vnd.apple.mpegurl", ByteArrayInputStream(data), data.size.toLong())
            response.addHeader("Cache-Control", "no-cache, no-store, must-revalidate")
            response.addHeader("Pragma", "no-cache")
            response.addHeader("Expires", "0")
            response
        } catch (e: Exception) {
            Log.w(TAG, "manifest fetch failed", e)
            newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE, "text/plain", "Proxy unavailable")
        }
    }

    private fun handleSegment(session: IHTTPSession): Response {
        val url = HlsHeaderCodec.normalizeParam(session.parameters["url"]?.firstOrNull())
            ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Missing url")
        val headers = HlsHeaderCodec.decode(session.parameters["headers"]?.firstOrNull())
        val streamKey = HlsHeaderCodec.normalizeParam(session.parameters["streamKey"]?.firstOrNull())
        val contentType = HlsManifest.guessContentType(url)
        val resourceKey = HlsIdentity.requestKey(url, headers)

        cacheStore.open(resourceKey)?.let { cached ->
            return newFixedLengthResponse(Response.Status.OK, contentType, cached.inputStream, cached.length)
        }

        return try {
            val data = fetchData(url, headers)
            putToCache(resourceKey, data, streamKey)
            fixedBinaryResponse(data, contentType)
        } catch (e: Exception) {
            Log.w(TAG, "segment fetch failed", e)
            newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE, "text/plain", "Proxy unavailable")
        }
    }

    private fun fixedBinaryResponse(data: ByteArray, contentType: String): Response {
        return newFixedLengthResponse(Response.Status.OK, contentType, ByteArrayInputStream(data), data.size.toLong())
    }

    private fun fetchText(url: String, headers: Map<String, String>?, useCaches: Boolean = true): String {
        val data = fetchData(url, headers, useCaches)
        return String(data, Charsets.UTF_8)
    }

    private fun fetchData(url: String, headers: Map<String, String>?, useCaches: Boolean = true): ByteArray {
        var lastError: Exception? = null

        for (attempt in 0..RETRY_DELAYS_MS.size) {
            try {
                return performFetchData(url, headers, useCaches)
            } catch (e: Exception) {
                lastError = e
                if (attempt >= RETRY_DELAYS_MS.size || !shouldRetry(e)) {
                    throw e
                }
                Thread.sleep(RETRY_DELAYS_MS[attempt])
            }
        }

        throw lastError ?: IOException("Unknown proxy fetch error")
    }

    private fun performFetchData(url: String, headers: Map<String, String>?, useCaches: Boolean): ByteArray {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            this.useCaches = useCaches
            connectTimeout = FETCH_TIMEOUT_MS
            readTimeout = FETCH_TIMEOUT_MS
            requestMethod = "GET"
            headers?.forEach { (k, v) -> setRequestProperty(k, v) }
        }
        try {
            val statusCode = connection.responseCode
            if (statusCode >= 500) {
              throw IOException("Upstream unavailable ($statusCode)")
            }
            if (statusCode >= 400) {
              throw HttpStatusException(statusCode)
            }
            connection.inputStream.use { stream ->
                val data = stream.readBytes()
                if (data.isEmpty()) {
                    throw IOException("Empty response body")
                }
                return data
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun validateManifest(manifest: String) {
        val trimmed = manifest.trim()
        require(trimmed.isNotEmpty() && trimmed.contains("#EXTM3U")) {
            "Invalid HLS manifest"
        }
    }

    private fun shouldRetry(error: Exception): Boolean {
        if (error is InterruptedException) {
            Thread.currentThread().interrupt()
            return false
        }
        if (error is HttpStatusException) {
            return error.statusCode >= 500
        }
        return error is IOException || error is IllegalArgumentException
    }
}

private class HttpStatusException(val statusCode: Int) : IOException("HTTP $statusCode")

object NanoHttpdConfig {
    const val TIMEOUT_MS = 12_000
}
