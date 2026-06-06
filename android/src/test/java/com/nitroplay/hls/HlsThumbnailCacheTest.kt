package com.nitroplay.hls

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

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
}
