package com.nitroplay.video.streaming

import android.content.Context
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.io.FileInputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.io.SequenceInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import com.nitroplay.video.streaming.cache.HlsCacheBudget
import com.nitroplay.video.streaming.cache.HlsCacheStore
import com.nitroplay.video.streaming.cache.HlsCacheWriteHandle

class HlsProxyServer(
    private val port: Int,
    private val context: Context,
    maxCacheBytes: Long = HlsCacheBudget.DEFAULT_MAX_BYTES
) : NanoHTTPD("127.0.0.1", port) {
    companion object {
        private const val TAG = "NitroPlayHlsProxy"
        private val RETRY_DELAYS_MS = longArrayOf(100L, 300L)
        // Upstream segment/manifest fetch timeout. parity-divergent: iOS HlsProxyServerController uses 10s.
        private const val FETCH_TIMEOUT_MS = 12_000
    }

    val cacheStore = HlsCacheStore(context, maxCacheBytes)
    private val executor = Executors.newSingleThreadExecutor()
    private val inFlightSegments = ConcurrentHashMap<String, CountDownLatch>()

    // Set before tearing down executor/cacheStore so in-flight prefetch/segment
    // tasks skip cache writes instead of racing a closed store.
    @Volatile
    private var closed = false

    // The OS-assigned bound port (NanoHTTPD resolves port 0 to an ephemeral port),
    // not the requested one, so proxied URLs target the actual listening socket.
    fun listeningPort(): Int = getListeningPort()

    override fun stop() {
        closed = true
        inFlightSegments.values.forEach { it.countDown() }
        inFlightSegments.clear()
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
        count: Int,
        onComplete: () -> Unit,
        onError: (Throwable) -> Unit,
        visitedUrls: MutableSet<String> = mutableSetOf(),
        streamKey: String = HlsIdentity.requestKey(url, headers)
    ) {
        try {
            executor.execute {
                runPrefetch(url, headers, count, onComplete, onError, visitedUrls, streamKey)
            }
        } catch (e: RejectedExecutionException) {
            onError(e)
        }
    }

    private fun runPrefetch(
        url: String,
        headers: Map<String, String>?,
        count: Int,
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
                        prefetch(resolved, headers, count, onComplete, onError, visitedUrls, streamKey)
                        return
                    }
                }
                val (initSeg, segments) = HlsManifest.extractLeadingSegments(manifest, count)
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

        cacheStore.getFilePath(resourceKey)?.let { file ->
            return newFixedLengthResponse(Response.Status.OK, contentType, FileInputStream(file), file.length())
        }

        while (true) {
            val ownerLatch = CountDownLatch(1)
            val existing = inFlightSegments.putIfAbsent(resourceKey, ownerLatch)
            if (existing == null) {
                return streamSegmentResponse(url, headers, streamKey, contentType, resourceKey, ownerLatch)
            }

            try {
                existing.await()
            } catch (error: InterruptedException) {
                Thread.currentThread().interrupt()
                return newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE, "text/plain", "Proxy unavailable")
            }

            cacheStore.getFilePath(resourceKey)?.let { file ->
                return newFixedLengthResponse(Response.Status.OK, contentType, FileInputStream(file), file.length())
            }
        }
    }

    private fun streamSegmentResponse(
        url: String,
        headers: Map<String, String>?,
        streamKey: String?,
        contentType: String,
        resourceKey: String,
        ownerLatch: CountDownLatch
    ): Response {
        var fetch: StreamingFetch? = null
        var cacheWrite: HlsCacheWriteHandle? = null
        var cacheOutput: OutputStream? = null
        return try {
            fetch = openStreamingFetch(url, headers)
            cacheWrite = cacheStore.beginWrite(resourceKey)
            cacheOutput = cacheStore.openWriteStream(cacheWrite)
            val responseStream = CacheWritingInputStream(
                upstream = fetch.input,
                connection = fetch.connection,
                cacheStore = cacheStore,
                writeHandle = cacheWrite,
                cacheOutput = cacheOutput,
                streamKey = streamKey,
                expectedLength = if (fetch.contentLength >= 0L) fetch.contentLength else null,
                onDone = {
                    inFlightSegments.remove(resourceKey, ownerLatch)
                    ownerLatch.countDown()
                }
            )
            cacheOutput = null
            if (fetch.contentLength >= 0L) {
                newFixedLengthResponse(Response.Status.OK, contentType, responseStream, fetch.contentLength)
            } else {
                newChunkedResponse(Response.Status.OK, contentType, responseStream)
            }
        } catch (e: Exception) {
            cacheOutput?.closeIgnoringErrors()
            cacheWrite?.let { cacheStore.discardWrite(it) }
            fetch?.close()
            inFlightSegments.remove(resourceKey, ownerLatch)
            ownerLatch.countDown()
            Log.w(TAG, "segment fetch failed", e)
            newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE, "text/plain", "Proxy unavailable")
        }
    }

    private fun fetchText(url: String, headers: Map<String, String>?, useCaches: Boolean = true): String {
        val data = fetchData(url, headers, useCaches)
        return String(data, Charsets.UTF_8)
    }

    private fun fetchData(url: String, headers: Map<String, String>?, useCaches: Boolean = true): ByteArray {
        val fetch = openStreamingFetch(url, headers, useCaches)
        return try {
            fetch.input.use { stream -> stream.readBytes() }
        } finally {
            fetch.connection.disconnect()
        }
    }

    private fun openStreamingFetch(
        url: String,
        headers: Map<String, String>?,
        useCaches: Boolean = true
    ): StreamingFetch {
        var lastError: Exception? = null

        for (attempt in 0..RETRY_DELAYS_MS.size) {
            var connection: HttpURLConnection? = null
            try {
                connection = openConnection(url, headers, useCaches)
                val statusCode = connection.responseCode
                if (statusCode >= 500) {
                    throw IOException("Upstream unavailable ($statusCode)")
                }
                if (statusCode >= 400) {
                    throw HttpStatusException(statusCode)
                }
                val upstream = connection.inputStream
                val firstByte = upstream.read()
                if (firstByte < 0) {
                    throw IOException("Empty response body")
                }
                val primedStream = SequenceInputStream(ByteArrayInputStream(byteArrayOf(firstByte.toByte())), upstream)
                return StreamingFetch(
                    connection = connection,
                    input = primedStream,
                    contentLength = connection.contentLengthLong
                )
            } catch (e: Exception) {
                connection?.disconnect()
                lastError = e
                if (attempt >= RETRY_DELAYS_MS.size || !shouldRetry(e)) {
                    throw e
                }
                Thread.sleep(RETRY_DELAYS_MS[attempt])
            }
        }

        throw lastError ?: IOException("Unknown proxy fetch error")
    }

    private fun openConnection(url: String, headers: Map<String, String>?, useCaches: Boolean): HttpURLConnection {
        return (URL(url).openConnection() as HttpURLConnection).apply {
            this.useCaches = useCaches
            connectTimeout = FETCH_TIMEOUT_MS
            readTimeout = FETCH_TIMEOUT_MS
            requestMethod = "GET"
            headers?.forEach { (k, v) -> setRequestProperty(k, v) }
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

private data class StreamingFetch(
    val connection: HttpURLConnection,
    val input: InputStream,
    val contentLength: Long
) {
    fun close() {
        input.closeIgnoringErrors()
        connection.disconnect()
    }
}

private class CacheWritingInputStream(
    private val upstream: InputStream,
    private val connection: HttpURLConnection,
    private val cacheStore: HlsCacheStore,
    private val writeHandle: HlsCacheWriteHandle,
    private var cacheOutput: OutputStream?,
    private val streamKey: String?,
    private val expectedLength: Long?,
    private val onDone: () -> Unit
) : InputStream() {
    private var bytesRead = 0L
    private var finished = false

    override fun read(): Int {
        val buffer = ByteArray(1)
        val count = read(buffer, 0, 1)
        return if (count < 0) -1 else buffer[0].toInt() and 0xff
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        return try {
            val count = upstream.read(buffer, offset, length)
            if (count > 0) {
                bytesRead += count.toLong()
                writeCache(buffer, offset, count)
                if (expectedLength != null && bytesRead >= expectedLength) {
                    complete()
                }
            } else if (count < 0) {
                complete()
            }
            count
        } catch (error: IOException) {
            abort()
            throw error
        } catch (error: RuntimeException) {
            abort()
            throw error
        }
    }

    override fun close() {
        if (!finished) {
            abort()
        }
    }

    private fun writeCache(buffer: ByteArray, offset: Int, length: Int) {
        val output = cacheOutput ?: return
        try {
            output.write(buffer, offset, length)
        } catch (_: IOException) {
            disableCache()
        }
    }

    private fun complete() {
        if (finished) return
        finished = true
        val output = cacheOutput
        cacheOutput = null
        if (output != null) {
            try {
                output.close()
                cacheStore.commitWrite(writeHandle, streamKey, expectedLength)
            } catch (_: Exception) {
                cacheStore.discardWrite(writeHandle)
            }
        }
        closeUpstream()
        onDone()
    }

    private fun abort() {
        if (finished) return
        finished = true
        disableCache()
        closeUpstream()
        onDone()
    }

    private fun disableCache() {
        cacheOutput?.closeIgnoringErrors()
        cacheOutput = null
        cacheStore.discardWrite(writeHandle)
    }

    private fun closeUpstream() {
        upstream.closeIgnoringErrors()
        connection.disconnect()
    }
}

private fun InputStream.closeIgnoringErrors() {
    try {
        close()
    } catch (_: IOException) {
    }
}

private fun OutputStream.closeIgnoringErrors() {
    try {
        close()
    } catch (_: IOException) {
    }
}

private class HttpStatusException(val statusCode: Int) : IOException("HTTP $statusCode")

object NanoHttpdConfig {
    const val TIMEOUT_MS = 12_000
}
