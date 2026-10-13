package com.nitroplay.video.streaming.cache

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

class HlsCacheStore(
    context: Context,
    maxBytes: Long = HlsCacheBudget.DEFAULT_MAX_BYTES,
    private val onStreamEvicted: (String) -> Unit = {}
) {
    private val stateLock = Any()
    private val maxBytes: Long = HlsCacheBudget.normalize(maxBytes)
    private val ttlMs: Long = 7L * 24L * 60L * 60L * 1000L
    private val cacheDir = File(context.cacheDir, "hls-cache")
    private val indexFile = File(cacheDir, "index.json")
    private val index = mutableMapOf<String, HlsCacheEntry>()
    private val saveExecutor = Executors.newSingleThreadScheduledExecutor()
    private var pendingSave: ScheduledFuture<*>? = null
    private var closed = false

    init {
        synchronized(stateLock) {
            if (ensureCacheDirectoryLocked()) {
                if (loadIndexLocked()) {
                    scheduleSaveLocked()
                }
            }
        }
    }

    fun has(url: String): Boolean {
        synchronized(stateLock) {
            if (closed) return false
            val entry = index[url] ?: return false
            if (validFileLocked(entry) != null) return true
            removeLocked(url)
            scheduleSaveLocked()
            return false
        }
    }

    internal fun open(url: String): HlsCacheRead? {
        synchronized(stateLock) {
            if (closed) return null
            val entry = index[url] ?: return null
            val file = validFileLocked(entry)
            if (file == null) {
                removeLocked(url)
                scheduleSaveLocked()
                return null
            }
            return try {
                val inputStream = FileInputStream(file)
                entry.lastAccess = System.currentTimeMillis()
                scheduleSaveLocked()
                HlsCacheRead(inputStream, entry.size)
            } catch (_: IOException) {
                removeLocked(url)
                scheduleSaveLocked()
                null
            }
        }
    }

    fun put(url: String, data: ByteArray, streamKey: String?): Boolean {
        if (!HlsCacheContentValidator.isCacheableSegment(data)) {
            return false
        }
        synchronized(stateLock) {
            if (closed || !ensureCacheDirectoryLocked()) return false
        }

        val fileName = sha256(url) + ".seg"
        var tempFile: File? = null
        try {
            tempFile = File.createTempFile("$fileName-", ".tmp", cacheDir)
            FileOutputStream(tempFile).use { output ->
                output.write(data)
                output.flush()
                output.fd.sync()
            }
        } catch (_: IOException) {
            tempFile?.delete()
            return false
        }

        val temporary = tempFile ?: return false
        synchronized(stateLock) {
            if (closed) {
                temporary.delete()
                return false
            }

            val finalFile = File(cacheDir, fileName)
            if (!temporary.renameTo(finalFile)) {
                temporary.delete()
                val existingEntry = index[url]
                if (existingEntry != null && validFileLocked(existingEntry) == null) {
                    removeLocked(url)
                    scheduleSaveLocked()
                }
                return false
            }

            val now = System.currentTimeMillis()
            index[url] = HlsCacheEntry(url, fileName, data.size.toLong(), streamKey, now, now)
            evictIfNeededLocked()
            scheduleSaveLocked()
            return true
        }
    }

    fun clearStream(streamKey: String) {
        synchronized(stateLock) {
            if (closed) return
            val urls = index.values
                .filter { it.streamKey == streamKey }
                .map { it.url }
            if (urls.isEmpty()) return
            urls.forEach(::removeLocked)
            scheduleSaveLocked()
        }
    }

    fun totalBytes(): Long {
        synchronized(stateLock) {
            if (closed) return 0L
            return index.values.sumOf { it.size }
        }
    }

    fun fileCount(): Int {
        synchronized(stateLock) {
            if (closed) return 0
            return index.size
        }
    }

    fun clearAll() {
        synchronized(stateLock) {
            if (closed) return
            index.keys.toList().forEach(::removeLocked)
            deleteOrphanFilesLocked()
            scheduleSaveLocked()
        }
    }

    fun close() {
        val finalSave: Future<*>? = synchronized(stateLock) {
            if (closed) return
            closed = true
            pendingSave?.cancel(false)
            pendingSave = null
            try {
                saveExecutor.submit { saveIndex() }
            } catch (_: RejectedExecutionException) {
                null
            }
        }

        if (finalSave == null) {
            saveIndex()
        } else {
            try {
                finalSave.get()
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                saveIndex()
            } catch (_: Exception) {
                saveIndex()
            }
        }
        saveExecutor.shutdown()
    }

    private fun evictIfNeededLocked() {
        evictExpiredLocked()
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
                removeLocked(entry.url)
            }
        }
    }

    private fun evictExpiredLocked() {
        val now = System.currentTimeMillis()
        index.values
            .filter { now - it.createdAt > ttlMs }
            .map { it.url }
            .forEach(::removeLocked)
    }

    private fun removeLocked(url: String) {
        val entry = index.remove(url) ?: return
        File(cacheDir, entry.fileName).delete()
        entry.streamKey?.let(onStreamEvicted)
    }

    private fun validFileLocked(entry: HlsCacheEntry): File? {
        if (isExpired(entry) || !isSafeFileName(entry.fileName)) return null
        val file = File(cacheDir, entry.fileName)
        if (!file.exists() || file.length() <= 0L || file.length() != entry.size) return null
        return file
    }

    private fun isExpired(entry: HlsCacheEntry): Boolean {
        return System.currentTimeMillis() - entry.createdAt > ttlMs
    }

    private fun ensureCacheDirectoryLocked(): Boolean {
        return cacheDir.isDirectory || cacheDir.mkdirs()
    }

    private fun loadIndexLocked(): Boolean {
        if (!indexFile.exists()) {
            deleteOrphanFilesLocked()
            return false
        }

        var requiresSave = false
        try {
            val text = indexFile.readText()
            if (text.isNotBlank()) {
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
                    if (validFileLocked(entry) != null) {
                        index[key] = entry
                    } else {
                        requiresSave = true
                    }
                }
            } else {
                requiresSave = true
            }
        } catch (_: Exception) {
            index.clear()
            indexFile.delete()
            requiresSave = true
        }

        if (deleteOrphanFilesLocked()) {
            requiresSave = true
        }
        return requiresSave
    }

    private fun deleteOrphanFilesLocked(): Boolean {
        val validFileNames = index.values.mapTo(mutableSetOf()) { it.fileName }
        var deleted = false
        cacheDir.listFiles()?.forEach { file ->
            val isOrphanSegment = file.name.endsWith(".seg") && file.name !in validFileNames
            if (file.name.endsWith(".tmp") || isOrphanSegment) {
                deleted = file.delete() || deleted
            }
        }
        return deleted
    }

    private fun scheduleSaveLocked() {
        if (closed) return
        pendingSave?.cancel(false)
        pendingSave = saveExecutor.schedule({ saveIndex() }, 5, TimeUnit.SECONDS)
    }

    private fun saveIndex() {
        val snapshot = synchronized(stateLock) {
            index.values.map { it.copy() }
        }
        writeIndexSnapshot(snapshot)
    }

    private fun writeIndexSnapshot(snapshot: List<HlsCacheEntry>) {
        val json = JSONObject()
        snapshot.forEach { entry ->
            val obj = JSONObject()
            obj.put("fileName", entry.fileName)
            obj.put("size", entry.size)
            obj.put("streamKey", entry.streamKey)
            obj.put("createdAt", entry.createdAt)
            obj.put("lastAccess", entry.lastAccess)
            json.put(entry.url, obj)
        }

        val temporary = File.createTempFile("index-", ".tmp", cacheDir)
        try {
            FileOutputStream(temporary).use { output ->
                output.write(json.toString().toByteArray())
                output.flush()
                output.fd.sync()
            }
            if (!temporary.renameTo(indexFile)) {
                throw IOException("Unable to replace HLS cache index")
            }
        } finally {
            if (temporary.exists()) {
                temporary.delete()
            }
        }
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
}

internal data class HlsCacheRead(
    val inputStream: InputStream,
    val length: Long
)

data class HlsCacheEntry(
    val url: String,
    val fileName: String,
    val size: Long,
    val streamKey: String?,
    val createdAt: Long,
    var lastAccess: Long
)
