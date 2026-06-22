package com.nitroplay.video.streaming.cache

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

class HlsCacheStore(context: Context, maxBytes: Long = HlsCacheBudget.DEFAULT_MAX_BYTES) {
    @Volatile
    private var maxBytes: Long = HlsCacheBudget.normalize(maxBytes)
    private val ttlMs: Long = 7L * 24L * 60L * 60L * 1000L
    private val cacheDir = File(context.cacheDir, "hls-cache")
    private val indexFile = File(cacheDir, "index.json")
    private val index = ConcurrentHashMap<String, HlsCacheEntry>()
    private val saveExecutor = Executors.newSingleThreadScheduledExecutor()
    private var pendingSave: ScheduledFuture<*>? = null

    init {
        if (!cacheDir.exists()) cacheDir.mkdirs()
        loadIndex()
    }

    fun setMaxBytes(bytes: Long) {
        maxBytes = HlsCacheBudget.normalize(bytes)
        evictIfNeeded()
        saveIndex()
    }

    fun has(url: String): Boolean {
        val entry = index[url] ?: return false
        if (isExpired(entry) || !isSafeFileName(entry.fileName)) {
            remove(url)
            return false
        }
        val file = File(cacheDir, entry.fileName)
        if (!file.exists() || file.length() <= 0L || file.length() != entry.size) {
            remove(url)
            return false
        }
        return true
    }

    fun getFilePath(url: String): File? {
        val entry = index[url] ?: return null
        if (isExpired(entry) || !isSafeFileName(entry.fileName)) {
            remove(url)
            return null
        }
        val file = File(cacheDir, entry.fileName)
        if (!file.exists() || file.length() <= 0L || file.length() != entry.size) {
            remove(url)
            return null
        }
        entry.lastAccess = System.currentTimeMillis()
        scheduleSave()
        return file
    }

    fun get(url: String): ByteArray? {
        val entry = index[url] ?: return null
        if (isExpired(entry) || !isSafeFileName(entry.fileName)) {
            remove(url)
            return null
        }
        val file = File(cacheDir, entry.fileName)
        if (!file.exists() || file.length() <= 0L || file.length() != entry.size) {
            remove(url)
            return null
        }
        entry.lastAccess = System.currentTimeMillis()
        scheduleSave()
        return file.readBytes()
    }

    fun put(url: String, data: ByteArray, streamKey: String?) {
        if (!cacheDir.exists()) cacheDir.mkdirs()
        evictIfNeeded()
        val name = sha256(url) + ".seg"
        val file = File(cacheDir, name)
        file.writeBytes(data)
        index[url] = HlsCacheEntry(url, name, data.size.toLong(), streamKey, System.currentTimeMillis(), System.currentTimeMillis())
        evictIfNeeded()
        scheduleSave()
    }

    fun getCacheStats(): Map<String, Any> {
        evictExpired()
        return mapOf(
            "totalSize" to index.values.sumOf { it.size },
            "fileCount" to index.size,
            "maxSize" to maxBytes
        )
    }

    fun getStreamCacheStats(streamKey: String): Map<String, Any> {
        evictExpired()
        val streamEntries = index.values.filter { it.streamKey == streamKey }
        return mapOf(
            "totalSize" to index.values.sumOf { it.size },
            "fileCount" to index.size,
            "maxSize" to maxBytes,
            "streamSize" to streamEntries.sumOf { it.size },
            "streamFileCount" to streamEntries.size
        )
    }

    fun clearAll() {
        index.values.forEach { entry ->
            val file = File(cacheDir, entry.fileName)
            if (file.exists()) file.delete()
        }
        index.clear()
        // Sweep any orphan files (written but never indexed, or left by a crash) so
        // the directory matches the now-empty index.
        cacheDir
            .listFiles()
            ?.filter { it.name != indexFile.name }
            ?.forEach { it.delete() }
        saveIndex()
    }

    fun clearThumbnails() {
        // Drop indexed thumbnails (deletes file + index entry) ...
        index.values.filter { it.fileName.endsWith(".thumb") }.forEach { remove(it.url) }
        // ... and sweep any legacy/un-indexed thumbnail files left on disk.
        cacheDir
            .listFiles()
            ?.filter { it.name.endsWith(".thumb") }
            ?.forEach { it.delete() }
        // Reconcile: drop any index entry whose backing file no longer exists.
        index.values
            .filter { !File(cacheDir, it.fileName).exists() }
            .forEach { index.remove(it.url) }
        // Persist immediately so the on-disk index never lags the cleared state.
        saveIndex()
    }

    fun close() {
        pendingSave?.cancel(false)
        pendingSave = null
        saveIndex()
        saveExecutor.shutdownNow()
    }

    private fun evictIfNeeded() {
        evictExpired()
        var total = index.values.sumOf { it.size }
        if (total <= maxBytes) return
        val target = HlsCacheBudget.evictionTarget(maxBytes)

        val streams = index.values.groupBy { it.streamKey ?: it.url }
        val sorted = streams.entries.sortedBy { entry ->
            entry.value.minOfOrNull { it.lastAccess } ?: 0L
        }

        for ((_, entries) in sorted) {
            if (total <= target) break
            for (entry in entries) {
                total -= entry.size
                remove(entry.url)
            }
        }
    }

    private fun evictExpired() {
        val now = System.currentTimeMillis()
        index.values.filter { now - it.createdAt > ttlMs }.forEach { remove(it.url) }
    }

    private fun remove(url: String) {
        val entry = index[url] ?: return
        val file = File(cacheDir, entry.fileName)
        if (file.exists()) file.delete()
        index.remove(url)
        scheduleSave()
    }

    private fun isExpired(entry: HlsCacheEntry): Boolean {
        return System.currentTimeMillis() - entry.createdAt > ttlMs
    }

    private fun loadIndex() {
        if (!indexFile.exists()) return
        try {
            val text = indexFile.readText()
            if (text.isBlank()) return
            val json = JSONObject(text)
            json.keys().forEach { key ->
                val obj = json.getJSONObject(key)
                val entry = HlsCacheEntry(
                    url = key,
                    fileName = obj.getString("fileName"),
                    size = obj.getLong("size"),
                    streamKey = if (obj.has("streamKey") && !obj.isNull("streamKey")) obj.getString("streamKey") else null,
                    createdAt = obj.getLong("createdAt"),
                    lastAccess = obj.getLong("lastAccess")
                )
                val file = File(cacheDir, entry.fileName)
                if (isSafeFileName(entry.fileName) && file.exists() && file.length() > 0L && file.length() == entry.size) {
                    index[key] = entry
                }
            }
        } catch (_: Exception) {
            index.clear()
            indexFile.delete()
        }
    }

    private fun scheduleSave() {
        pendingSave?.cancel(false)
        pendingSave = saveExecutor.schedule({
            saveIndex()
        }, 5, TimeUnit.SECONDS)
    }

    @Synchronized
    private fun saveIndex() {
        val json = JSONObject()
        index.forEach { (url, entry) ->
            val obj = JSONObject()
            obj.put("fileName", entry.fileName)
            obj.put("size", entry.size)
            obj.put("streamKey", entry.streamKey)
            obj.put("createdAt", entry.createdAt)
            obj.put("lastAccess", entry.lastAccess)
            json.put(url, obj)
        }
        indexFile.writeText(json.toString())
    }

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun isSafeFileName(fileName: String): Boolean {
        return fileName.isNotBlank() &&
            fileName == File(fileName).name &&
            !fileName.contains("/") &&
            !fileName.contains("\\") &&
            !fileName.contains("..")
    }

    // Thumbnails share the segment index so they participate in the same TTL and
    // size eviction. They are keyed under a "thumb:" namespace to avoid colliding
    // with a segment cached under the same URL; the on-disk file keeps the plain
    // sha256(url).thumb name so previously written thumbnails still resolve.
    private fun thumbnailKey(url: String): String = "thumb:$url"

    fun putThumbnail(url: String, data: ByteArray): String? {
        if (!cacheDir.exists()) cacheDir.mkdirs()
        evictIfNeeded()
        val name = "${sha256(url)}.thumb"
        val file = File(cacheDir, name)
        return try {
            file.writeBytes(data)
            val now = System.currentTimeMillis()
            val key = thumbnailKey(url)
            index[key] = HlsCacheEntry(key, name, data.size.toLong(), null, now, now)
            evictIfNeeded()
            scheduleSave()
            Uri.fromFile(file).toString()
        } catch (_: Exception) {
            null
        }
    }

    fun getThumbnailPath(url: String): String? {
        val name = "${sha256(url)}.thumb"
        val file = File(cacheDir, name)
        val key = thumbnailKey(url)
        val entry = index[key]
        if (entry != null) {
            if (isExpired(entry) || !file.exists()) {
                remove(key)
                return null
            }
            entry.lastAccess = System.currentTimeMillis()
            scheduleSave()
            return Uri.fromFile(file).toString()
        }
        // Legacy thumbnail written before indexing: register it lazily so it now
        // participates in TTL/size eviction.
        if (!file.exists()) return null
        val now = System.currentTimeMillis()
        index[key] = HlsCacheEntry(key, name, file.length(), null, now, now)
        scheduleSave()
        return Uri.fromFile(file).toString()
    }

    fun hasThumbnail(url: String): Boolean {
        val key = thumbnailKey(url)
        val entry = index[key]
        if (entry != null && isExpired(entry)) {
            remove(key)
            return false
        }
        val name = "${sha256(url)}.thumb"
        return File(cacheDir, name).exists()
    }
}

data class HlsCacheEntry(
    val url: String,
    val fileName: String,
    val size: Long,
    val streamKey: String?,
    val createdAt: Long,
    var lastAccess: Long
)
