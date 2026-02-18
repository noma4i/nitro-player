package com.yupi.hls

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class HlsCacheProxyServer(
    private val port: Int,
    private val context: Context
) : NanoHTTPD("127.0.0.1", port) {
    val cacheStore = HlsCacheStore(context)
    private val executor = Executors.newSingleThreadExecutor()

    override fun serve(session: IHTTPSession): Response {
        return try {
            when (session.uri) {
                "/hls/manifest.m3u8" -> handleManifest(session)
                "/hls/segment" -> handleSegment(session)
                else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found")
            }
        } catch (e: Exception) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Error")
        }
    }

    fun prefetch(
        url: String,
        headers: Map<String, String>?,
        onComplete: () -> Unit,
        onError: (Throwable) -> Unit,
        visitedUrls: MutableSet<String> = mutableSetOf(),
        streamKey: String = url
    ) {
        executor.execute {
            try {
                if (url in visitedUrls) { onComplete(); return@execute }
                visitedUrls.add(url)

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
                    if (!cacheStore.has(resolved)) {
                        val data = fetchData(resolved, headers)
                        cacheStore.put(resolved, data, streamKey)
                    }
                }
                if (firstSeg != null) {
                    val resolved = HlsManifest.resolveUrl(url, firstSeg)
                    if (!cacheStore.has(resolved)) {
                        val data = fetchData(resolved, headers)
                        cacheStore.put(resolved, data, streamKey)
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
        val manifest = fetchText(url, headers)
        val rewritten = if (HlsManifest.isMaster(manifest)) {
            HlsManifest.rewriteMaster(manifest, url, headers, port, streamKey)
        } else {
            HlsManifest.rewriteMedia(manifest, url, headers, port, streamKey)
        }
        val data = rewritten.toByteArray(Charsets.UTF_8)
        return newFixedLengthResponse(Response.Status.OK, "application/vnd.apple.mpegurl", ByteArrayInputStream(data), data.size.toLong())
    }

    private fun handleSegment(session: IHTTPSession): Response {
        val url = HlsHeaderCodec.decodeUrl(session.parameters["url"]?.firstOrNull())
            ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Missing url")
        val headers = HlsHeaderCodec.decode(session.parameters["headers"]?.firstOrNull())
        val streamKey = HlsHeaderCodec.decodeUrl(session.parameters["streamKey"]?.firstOrNull())
        val contentType = HlsManifest.guessContentType(url)

        cacheStore.getFilePath(url)?.let { file ->
            return newFixedLengthResponse(Response.Status.OK, contentType, FileInputStream(file), file.length())
        }

        val data = fetchData(url, headers)
        cacheStore.put(url, data, streamKey)
        return fixedBinaryResponse(data, contentType)
    }

    private fun fixedBinaryResponse(data: ByteArray, contentType: String): Response {
        return newFixedLengthResponse(Response.Status.OK, contentType, ByteArrayInputStream(data), data.size.toLong())
    }

    private fun fetchText(url: String, headers: Map<String, String>?): String {
        val data = fetchData(url, headers)
        return String(data, Charsets.UTF_8)
    }

    private fun fetchData(url: String, headers: Map<String, String>?): ByteArray {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 12_000
            readTimeout = 12_000
            requestMethod = "GET"
            headers?.forEach { (k, v) -> setRequestProperty(k, v) }
        }
        try {
            connection.inputStream.use { stream ->
                return stream.readBytes()
            }
        } finally {
            connection.disconnect()
        }
    }
}

object NanoHttpdConfig {
    const val TIMEOUT_MS = 12_000
}
