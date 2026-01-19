package com.yupi.hls

object HlsManifest {
    private const val STREAM_INF = "#EXT-X-STREAM-INF"
    private const val MAP_TAG = "#EXT-X-MAP"
    private const val KEY_TAG = "#EXT-X-KEY"

    fun isMaster(manifest: String): Boolean = manifest.contains(STREAM_INF)

    fun extractVariants(manifest: String): List<String> {
        val lines = manifest.split("\n")
        val urls = mutableListOf<String>()
        var i = 0
        while (i < lines.size) {
            val line = lines[i].trim()
            if (line.startsWith(STREAM_INF) && i + 1 < lines.size) {
                val next = lines[i + 1].trim()
                if (!next.startsWith("#") && next.isNotEmpty()) {
                    urls.add(next)
                }
                i += 1
            }
            i += 1
        }
        return urls
    }

    fun extractInitAndFirstSegment(manifest: String): Pair<String?, String?> {
        val lines = manifest.split("\n")
        var initSeg: String? = null
        var firstSeg: String? = null
        for (raw in lines) {
            val line = raw.trim()
            if (line.startsWith(MAP_TAG)) {
                extractUri(line)?.let { initSeg = it }
            }
            if (!line.startsWith("#") && line.isNotEmpty()) {
                firstSeg = line
                break
            }
        }
        return Pair(initSeg, firstSeg)
    }

    fun rewriteMaster(manifest: String, baseUrl: String, headers: Map<String, String>?, port: Int): String {
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
                    output.add(proxyManifestUrl(resolved, headers, port))
                    i += 1
                }
            }
            i += 1
        }
        return output.joinToString("\n")
    }

    fun rewriteMedia(manifest: String, baseUrl: String, headers: Map<String, String>?, port: Int): String {
        val lines = manifest.split("\n")
        val output = mutableListOf<String>()

        for (raw in lines) {
            val line = raw.trim()
            if (line.startsWith(MAP_TAG)) {
                val uri = extractUri(line)
                if (uri != null) {
                    val resolved = resolveUrl(baseUrl, uri)
                    val proxy = proxySegmentUrl(resolved, headers, port, null)
                    output.add(raw.replace(uri, proxy))
                    continue
                }
            }
            if (line.startsWith(KEY_TAG)) {
                val uri = extractUri(line)
                if (uri != null) {
                    val resolved = resolveUrl(baseUrl, uri)
                    val proxy = proxySegmentUrl(resolved, headers, port, null)
                    output.add(raw.replace(uri, proxy))
                    continue
                }
            }
            if (line.startsWith("#") || line.isEmpty()) {
                output.add(raw)
                continue
            }
            val resolved = resolveUrl(baseUrl, line)
            val proxy = proxySegmentUrl(resolved, headers, port, null)
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
        return when {
            url.endsWith(".m3u8") -> "application/vnd.apple.mpegurl"
            url.endsWith(".m4s") -> "video/iso.segment"
            url.endsWith(".mp4") -> "video/mp4"
            else -> "video/MP2T"
        }
    }

    private fun extractUri(line: String): String? {
        val regex = Regex("URI=\"([^\"]+)\"")
        return regex.find(line)?.groups?.get(1)?.value
    }

    private fun proxyManifestUrl(url: String, headers: Map<String, String>?, port: Int): String {
        val query = StringBuilder("url=").append(java.net.URLEncoder.encode(url, "UTF-8"))
        val encoded = HlsHeaderCodec.encode(headers)
        if (encoded != null) query.append("&headers=").append(java.net.URLEncoder.encode(encoded, "UTF-8"))
        return "http://127.0.0.1:$port/hls/manifest.m3u8?$query"
    }

    private fun proxySegmentUrl(url: String, headers: Map<String, String>?, port: Int, flags: Map<String, String>?): String {
        val query = StringBuilder("url=").append(java.net.URLEncoder.encode(url, "UTF-8"))
        val encoded = HlsHeaderCodec.encode(headers)
        if (encoded != null) query.append("&headers=").append(java.net.URLEncoder.encode(encoded, "UTF-8"))
        flags?.forEach { (k, v) -> query.append("&").append(k).append("=").append(v) }
        return "http://127.0.0.1:$port/hls/segment?$query"
    }
}
