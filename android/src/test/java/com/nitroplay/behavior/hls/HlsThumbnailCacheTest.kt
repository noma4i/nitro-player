package com.nitroplay.video.behavior.hls

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import com.nitroplay.video.streaming.cache.HlsCacheBudget
import com.nitroplay.video.streaming.cache.HlsCacheStore

/**
 * NP-MEMORY-05: thumbnails must be registered in the cache index so they take
 * part in the same TTL and size eviction as segments. Exercises the real
 * HlsCacheStore against a Robolectric-provided cache dir. Parity counterpart:
 * HlsThumbnailCacheTests.swift on iOS.
 */
@RunWith(AndroidJUnit4::class)
class HlsThumbnailCacheTest {

  private lateinit var store: HlsCacheStore

  @Before
  fun setUp() {
    store = HlsCacheStore(ApplicationProvider.getApplicationContext())
    store.clearAll()
    store.clearThumbnails()
  }

  @After
  fun tearDown() {
    store.clearAll()
    store.clearThumbnails()
    store.close()
  }

  @Test
  fun putThumbnail_registersEntryInIndex() {
    val data = ByteArray(128) { 1 }
    val path = store.putThumbnail("https://cdn.example.com/poster.jpg", data)

    assertNotNull(path)
    assertTrue(path!!.startsWith("file://"))
    val stats = store.getCacheStats()
    assertEquals(1, stats["fileCount"])
    assertEquals(128L, stats["totalSize"])
  }

  @Test
  fun clearThumbnails_removesIndexEntryAndFile() {
    store.putThumbnail("https://cdn.example.com/poster.jpg", ByteArray(64) { 2 })

    store.clearThumbnails()

    val stats = store.getCacheStats()
    assertEquals(0, stats["fileCount"])
    assertNull(store.getThumbnailPath("https://cdn.example.com/poster.jpg"))
    assertFalse(store.hasThumbnail("https://cdn.example.com/poster.jpg"))
  }

  @Test
  fun getThumbnailPath_returnsStoredFile() {
    val url = "https://cdn.example.com/poster.jpg"
    val written = store.putThumbnail(url, ByteArray(32) { 3 })

    val resolved = store.getThumbnailPath(url)

    assertNotNull(resolved)
    assertEquals(written, resolved)
    assertEquals("file", Uri.parse(resolved).scheme)
    assertTrue(store.hasThumbnail(url))
  }

  @Test
  fun thumbnailAndSegment_coexistWithoutCollision() {
    val url = "https://cdn.example.com/clip.ts"
    store.put(url, ByteArray(100) { 4 }, "stream1")
    store.putThumbnail(url, ByteArray(50) { 5 })

    // The "thumb:" namespace keeps the two entries distinct even for the same URL.
    val stats = store.getCacheStats()
    assertEquals(2, stats["fileCount"])
    assertEquals(150L, stats["totalSize"])
    assertNotNull(store.getFilePath(url))
    assertNotNull(store.getThumbnailPath(url))
  }

  @Test
  fun clearThumbnails_persistsClearedIndexToDisk() {
    store.putThumbnail("https://cdn.example.com/poster.jpg", ByteArray(64) { 2 })
    store.clearThumbnails()

    // A fresh store reloads index.json from disk; the cleared state must already
    // be persisted (clearThumbnails flushes immediately, not on the 5s debounce).
    val reloaded = HlsCacheStore(ApplicationProvider.getApplicationContext())
    try {
      assertEquals(0, reloaded.getCacheStats()["fileCount"])
      assertFalse(reloaded.hasThumbnail("https://cdn.example.com/poster.jpg"))
    } finally {
      reloaded.close()
    }
  }

  @Test
  fun clearAll_sweepsOrphanFilesFromDisk() {
    val ctx = ApplicationProvider.getApplicationContext<Context>()
    val cacheDir = File(ctx.cacheDir, "hls-cache").apply { mkdirs() }
    val orphan = File(cacheDir, "orphan.bin")
    orphan.writeBytes(ByteArray(16))
    store.put("https://cdn.example.com/clip.ts", ByteArray(40) { 7 }, "s1")

    store.clearAll()

    assertFalse("orphan file (never indexed) must be swept", orphan.exists())
    assertEquals(0, store.getCacheStats()["fileCount"])
    val remaining = cacheDir.listFiles()?.map { it.name }?.toSet() ?: emptySet()
    assertEquals(setOf("index.json"), remaining)
  }

  @Test
  fun staleZeroByteSegment_isInvalidatedBeforePlayback() {
    val url = "https://cdn.example.com/stale-zero.ts"
    writeLegacySegmentIndex(url, "zero.seg", indexedSize = 64, bytes = ByteArray(0))

    val reloaded = HlsCacheStore(ApplicationProvider.getApplicationContext())
    try {
      assertNull(reloaded.getFilePath(url))
      assertFalse(reloaded.has(url))
      assertEquals(0, reloaded.getCacheStats()["fileCount"])
    } finally {
      reloaded.close()
    }
  }

  @Test
  fun sizeMismatchSegment_isInvalidatedBeforePlayback() {
    val url = "https://cdn.example.com/stale-partial.ts"
    writeLegacySegmentIndex(url, "partial.seg", indexedSize = 64, bytes = ByteArray(8))

    val reloaded = HlsCacheStore(ApplicationProvider.getApplicationContext())
    try {
      assertNull(reloaded.getFilePath(url))
      assertNull(reloaded.get(url))
      assertEquals(0, reloaded.getCacheStats()["fileCount"])
    } finally {
      reloaded.close()
    }
  }

  @Test
  fun unsafeLegacyFileName_isIgnoredAndRemoved() {
    val url = "https://cdn.example.com/unsafe.ts"
    writeLegacySegmentIndex(url, "../unsafe.seg", indexedSize = 8, bytes = ByteArray(8))

    val reloaded = HlsCacheStore(ApplicationProvider.getApplicationContext())
    try {
      assertNull(reloaded.getFilePath(url))
      assertFalse(reloaded.has(url))
      assertEquals(0, reloaded.getCacheStats()["fileCount"])
    } finally {
      reloaded.close()
    }
  }

  @Test
  fun corruptIndex_doesNotCrashStoreInitialization() {
    val cacheDir = hlsCacheDir().apply { mkdirs() }
    File(cacheDir, "index.json").writeText("{")

    val reloaded = HlsCacheStore(ApplicationProvider.getApplicationContext())
    try {
      assertEquals(0, reloaded.getCacheStats()["fileCount"])
    } finally {
      reloaded.close()
    }
  }

  @Test
  fun defaultCacheBudget_isFourGiB() {
    val stats = store.getCacheStats()

    assertEquals(HlsCacheBudget.DEFAULT_MAX_BYTES, stats["maxSize"])
  }

  @Test
  fun setMaxBytes_clampsAndEvictsAfterSegmentWrite() {
    store.setMaxBytes(1)
    store.put("https://cdn.example.com/first.ts", ByteArray(36 * 1024 * 1024) { 1 }, "s1")
    store.put("https://cdn.example.com/second.ts", ByteArray(36 * 1024 * 1024) { 2 }, "s2")

    val stats = store.getCacheStats()

    assertEquals(HlsCacheBudget.MINIMUM_MAX_BYTES, stats["maxSize"])
    assertTrue((stats["totalSize"] as Long) <= HlsCacheBudget.MINIMUM_MAX_BYTES)
    assertEquals(1, stats["fileCount"])
  }

  private fun writeLegacySegmentIndex(url: String, fileName: String, indexedSize: Long, bytes: ByteArray) {
    val cacheDir = hlsCacheDir().apply { mkdirs() }
    File(cacheDir, fileName).apply {
      parentFile?.mkdirs()
      writeBytes(bytes)
    }
    val now = System.currentTimeMillis()
    File(cacheDir, "index.json").writeText(
      """
      {
        "$url": {
          "fileName": "$fileName",
          "size": $indexedSize,
          "streamKey": "stream",
          "createdAt": $now,
          "lastAccess": $now
        }
      }
      """.trimIndent()
    )
  }

  private fun hlsCacheDir(): File {
    val ctx = ApplicationProvider.getApplicationContext<Context>()
    return File(ctx.cacheDir, "hls-cache")
  }
}
