package com.nitroplay.video.streaming

data class HlsStreamVariant(
    val bandwidth: Int,
    val averageBandwidth: Int?,
    val width: Int?,
    val height: Int?,
    val codecs: String?,
    val uri: String
)

object HlsManifest {
    private const val STREAM_INF = "#EXT-X-STREAM-INF"
    private const val MAP_TAG = "#EXT-X-MAP"
    private const val KEY_TAG = "#EXT-X-KEY"

    fun isMaster(manifest: String): Boolean = manifest.contains(STREAM_INF)

    fun extractVariants(manifest: String): List<String> {
        return extractStreamVariants(manifest, null).map { it.uri }
    }

    fun extractStreamVariants(manifest: String, baseUrl: String?): List<HlsStreamVariant> {
        val lines = manifest.split("\n")
        val variants = mutableListOf<HlsStreamVariant>()
        var i = 0
        while (i < lines.size) {
            val line = lines[i].trim()
            if (line.startsWith(STREAM_INF) && i + 1 < lines.size) {
                val next = lines[i + 1].trim()
                if (!next.startsWith("#") && next.isNotEmpty()) {
                    val attributes = parseAttributeList(line)
                    val resolution = parseResolution(attributes["RESOLUTION"])
                    variants.add(
                        HlsStreamVariant(
                            bandwidth = attributes["BANDWIDTH"]?.toIntOrNull() ?: 0,
                            averageBandwidth = attributes["AVERAGE-BANDWIDTH"]?.toIntOrNull(),
                            width = resolution?.first,
                            height = resolution?.second,
                            codecs = attributes["CODECS"],
                            uri = baseUrl?.let { resolveUrl(it, next) } ?: next
                        )
                    )
                }
                i += 1
            }
            i += 1
        }
        return variants
    }

    fun extractLeadingSegments(manifest: String, count: Int): Pair<String?, List<String>> {
        val lines = manifest.split("\n")
        val targetCount = count.coerceAtLeast(0)
        var initSeg: String? = null
        val segments = mutableListOf<String>()
        for (raw in lines) {
            val line = raw.trim()
            if (line.startsWith(MAP_TAG)) {
                extractUri(line)?.let { initSeg = it }
            }
            if (!line.startsWith("#") && line.isNotEmpty()) {
                if (segments.size < targetCount) {
                    segments.add(line)
                }
                if (segments.size >= targetCount) {
                    break
                }
            }
        }
        return Pair(initSeg, segments)
    }

    fun rewriteMaster(
        manifest: String,
        baseUrl: String,
        headers: Map<String, String>?,
        port: Int,
        streamKey: String
    ): String {
        val lines = manifest.split("\n")
        val output = mutableListOf<String>()
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            output.add(line)
            if (line.trim().startsWith(STREAM_INF) && i + 1 < lines.size) {
                val next = lines[i + 1].trim()
                if (!next.startsWith("#") && next.isNotEmpty()) {
                    val resolved = resolveUrl(baseUrl, next)
                    output.add(proxyManifestUrl(resolved, headers, port, streamKey))
                    i += 1
                }
            }
            i += 1
        }
        return output.joinToString("\n")
    }

    fun rewriteMedia(
        manifest: String,
        baseUrl: String,
        headers: Map<String, String>?,
        port: Int,
        streamKey: String
    ): String {
        val lines = manifest.split("\n")
        val output = mutableListOf<String>()

        for (raw in lines) {
            val line = raw.trim()
            if (line.startsWith(MAP_TAG)) {
                val uri = extractUri(line)
                if (uri != null) {
                    val resolved = resolveUrl(baseUrl, uri)
                    val proxy = proxySegmentUrl(resolved, headers, port, streamKey, null)
                    output.add(raw.replace(uri, proxy))
                    continue
                }
            }
            if (line.startsWith(KEY_TAG)) {
                val uri = extractUri(line)
                if (uri != null) {
                    val resolved = resolveUrl(baseUrl, uri)
                    val proxy = proxySegmentUrl(resolved, headers, port, streamKey, null)
                    output.add(raw.replace(uri, proxy))
                    continue
                }
            }
            if (line.startsWith("#") || line.isEmpty()) {
                output.add(raw)
                continue
            }
            val resolved = resolveUrl(baseUrl, line)
            val proxy = proxySegmentUrl(resolved, headers, port, streamKey, null)
            output.add(proxy)
        }
        return output.joinToString("\n")
    }

    fun resolveUrl(baseUrl: String, relative: String): String {
        return try {
            val base = java.net.URL(baseUrl)
            java.net.URL(base, relative).toString()
        } catch (e: Exception) {
            relative
        }
    }

    fun guessContentType(url: String): String {
        val path = url.substringBefore('?').substringBefore('#')
        return when {
            path.endsWith(".m3u8") -> "application/vnd.apple.mpegurl"
            path.endsWith(".m4s") -> "video/iso.segment"
            path.endsWith(".mp4") -> "video/mp4"
            else -> "video/MP2T"
        }
    }

    private val URI_REGEX = Regex("URI=\"([^\"]+)\"")

    private fun parseAttributeList(line: String): Map<String, String> {
        val start = line.indexOf(':')
        if (start < 0) return emptyMap()

        val attributes = mutableMapOf<String, String>()
        val key = StringBuilder()
        val value = StringBuilder()
        var readingKey = true
        var insideQuotes = false

        for (index in (start + 1) until line.length) {
            val char = line[index]
            when {
                char == '"' -> insideQuotes = !insideQuotes
                readingKey && char == '=' -> readingKey = false
                !insideQuotes && char == ',' -> {
                    val normalizedKey = key.toString().trim()
                    if (normalizedKey.isNotEmpty()) {
                        attributes[normalizedKey] = value.toString().trim()
                    }
                    key.clear()
                    value.clear()
                    readingKey = true
                }
                readingKey -> key.append(char)
                else -> value.append(char)
            }
        }

        val normalizedKey = key.toString().trim()
        if (normalizedKey.isNotEmpty()) {
            attributes[normalizedKey] = value.toString().trim()
        }
        return attributes
    }

    private fun parseResolution(value: String?): Pair<Int, Int>? {
        val parts = value?.lowercase()?.split("x", limit = 2)?.mapNotNull { it.toIntOrNull() } ?: return null
        if (parts.size != 2) return null
        return Pair(parts[0], parts[1])
    }

    private fun extractUri(line: String): String? {
        return URI_REGEX.find(line)?.groups?.get(1)?.value
    }

    private fun buildProxyQuery(
        url: String,
        headers: Map<String, String>?,
        streamKey: String,
        extras: Map<String, String>? = null
    ): String {
        val query = StringBuilder("url=").append(java.net.URLEncoder.encode(url, "UTF-8"))
        val encoded = HlsHeaderCodec.encode(headers)
        if (encoded != null) query.append("&headers=").append(java.net.URLEncoder.encode(encoded, "UTF-8"))
        query.append("&streamKey=").append(java.net.URLEncoder.encode(streamKey, "UTF-8"))
        extras?.forEach { (k, v) -> query.append("&").append(k).append("=").append(v) }
        return query.toString()
    }

    private fun proxyManifestUrl(url: String, headers: Map<String, String>?, port: Int, streamKey: String): String {
        return "http://127.0.0.1:$port/hls/manifest.m3u8?${buildProxyQuery(url, headers, streamKey)}"
    }

    private fun proxySegmentUrl(
        url: String,
        headers: Map<String, String>?,
        port: Int,
        streamKey: String,
        flags: Map<String, String>?
    ): String {
        return "http://127.0.0.1:$port/hls/segment?${buildProxyQuery(url, headers, streamKey, flags)}"
    }
}
