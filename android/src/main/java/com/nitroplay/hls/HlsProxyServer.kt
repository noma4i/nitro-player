package com.nitroplay.hls

import android.content.Context
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.io.FileInputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class HlsProxyServer(
    private val port: Int,
    private val context: Context
) : NanoHTTPD("127.0.0.1", port) {
    companion object {
        private const val TAG = "NitroPlayStreamRuntime"
        private val RETRY_DELAYS_MS = longArrayOf(100L, 300L)
    }

    val cacheStore = HlsCacheStore(context)
    private val executor = Executors.newSingleThreadExecutor()

    fun listeningPort(): Int = port

    override fun stop() {
        super.stop()
        executor.shutdownNow()
        cacheStore.close()
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
        onComplete: () -> Unit,
        onError: (Throwable) -> Unit,
        visitedUrls: MutableSet<String> = mutableSetOf(),
        streamKey: String = HlsIdentity.sourceKey(url, headers)
    ) {
        executor.execute {
            try {
                val manifestKey = HlsIdentity.resourceKey(url, headers)
                if (manifestKey in visitedUrls) { onComplete(); return@execute }
                visitedUrls.add(manifestKey)

                val manifest = fetchText(url, headers)
                if (HlsManifest.isMaster(manifest)) {
                    val variants = HlsManifest.extractVariants(manifest)
                    if (variants.isNotEmpty()) {
                        val resolved = HlsManifest.resolveUrl(url, variants[0])
                        prefetch(resolved, headers, onComplete, onError, visitedUrls, streamKey)
                        return@execute
                    }
                }
                val (initSeg, firstSeg) = HlsManifest.extractInitAndFirstSegment(manifest)
                if (initSeg != null) {
                    val resolved = HlsManifest.resolveUrl(url, initSeg)
                    val resourceKey = HlsIdentity.resourceKey(resolved, headers)
                    if (!cacheStore.has(resourceKey)) {
                        val data = fetchData(resolved, headers)
                        cacheStore.put(resourceKey, data, streamKey)
                    }
                }
                if (firstSeg != null) {
                    val resolved = HlsManifest.resolveUrl(url, firstSeg)
                    val resourceKey = HlsIdentity.resourceKey(resolved, headers)
                    if (!cacheStore.has(resourceKey)) {
                        val data = fetchData(resolved, headers)
                        cacheStore.put(resourceKey, data, streamKey)
                    }
                }
                onComplete()
            } catch (e: Exception) {
                onError(e)
            }
        }
    }

    private fun handleManifest(session: IHTTPSession): Response {
        val url = HlsHeaderCodec.decodeUrl(session.parameters["url"]?.firstOrNull())
            ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Missing url")
        val headers = HlsHeaderCodec.decode(session.parameters["headers"]?.firstOrNull())
        val streamKey = HlsHeaderCodec.decodeUrl(session.parameters["streamKey"]?.firstOrNull()) ?: url
        return try {
            val manifest = fetchText(url, headers, useCaches = false)
            validateManifest(manifest)
            val rewritten = if (HlsManifest.isMaster(manifest)) {
                HlsManifest.rewriteMaster(manifest, url, headers, port, streamKey)
            } else {
                HlsManifest.rewriteMedia(manifest, url, headers, port, streamKey)
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
        val url = HlsHeaderCodec.decodeUrl(session.parameters["url"]?.firstOrNull())
            ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Missing url")
        val headers = HlsHeaderCodec.decode(session.parameters["headers"]?.firstOrNull())
        val streamKey = HlsHeaderCodec.decodeUrl(session.parameters["streamKey"]?.firstOrNull())
        val contentType = HlsManifest.guessContentType(url)
        val resourceKey = HlsIdentity.resourceKey(url, headers)

        cacheStore.getFilePath(resourceKey)?.let { file ->
            return newFixedLengthResponse(Response.Status.OK, contentType, FileInputStream(file), file.length())
        }

        return try {
            val data = fetchData(url, headers)
            cacheStore.put(resourceKey, data, streamKey)
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
            connectTimeout = 12_000
            readTimeout = 12_000
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
