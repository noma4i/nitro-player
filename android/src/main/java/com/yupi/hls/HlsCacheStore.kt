package com.yupi.hls

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

class HlsCacheStore(context: Context) {
    private val maxBytes: Long = 5L * 1024L * 1024L * 1024L
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

    fun has(url: String): Boolean {
        val entry = index[url] ?: return false
        if (isExpired(entry)) {
            remove(url)
            return false
        }
        return File(cacheDir, entry.fileName).exists()
    }

    fun getFilePath(url: String): File? {
        val entry = index[url] ?: return null
        if (isExpired(entry)) {
            remove(url)
            return null
        }
        val file = File(cacheDir, entry.fileName)
        if (!file.exists()) {
            remove(url)
            return null
        }
        entry.lastAccess = System.currentTimeMillis()
        scheduleSave()
        return file
    }

    fun get(url: String): ByteArray? {
        val entry = index[url] ?: return null
        if (isExpired(entry)) {
            remove(url)
            return null
        }
        val file = File(cacheDir, entry.fileName)
        if (!file.exists()) {
            remove(url)
            return null
        }
        entry.lastAccess = System.currentTimeMillis()
        scheduleSave()
        return file.readBytes()
    }

    fun put(url: String, data: ByteArray, streamKey: String?) {
        if (!cacheDir.exists()) cacheDir.mkdirs()
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
        saveIndex()
    }

    private fun evictIfNeeded() {
        evictExpired()
        var total = index.values.sumOf { it.size }
        if (total <= maxBytes) return
        val entries = index.values.sortedBy { it.lastAccess }
        for (entry in entries) {
            if (total <= maxBytes) break
            total -= entry.size
            remove(entry.url)
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
            index[key] = entry
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
}

data class HlsCacheEntry(
    val url: String,
    val fileName: String,
    val size: Long,
    val streamKey: String?,
    val createdAt: Long,
    var lastAccess: Long
)
