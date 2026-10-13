package com.nitroplay.video.behavior.hls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import com.nitroplay.video.streaming.HlsPrefetchDeduper

class HlsPrefetchDeduperTest {
  @Test
  fun duplicateInsideWindowIsSkipped() {
    var now = 1_000L
    val deduper = HlsPrefetchDeduper(windowMs = 60_000, maxEntries = 500) { now }

    assertTrue(deduper.shouldPrefetch("stream-a", 1.0))
    now += 1_000

    assertFalse(deduper.shouldPrefetch("stream-a", 1.0))
    assertEquals(1, deduper.size)
  }

  @Test
  fun longerDurationInsideWindowPrefetchesAgain() {
    var now = 1_000L
    val deduper = HlsPrefetchDeduper(windowMs = 60_000, maxEntries = 500) { now }

    assertTrue(deduper.shouldPrefetch("stream-a", 1.0))
    now += 1_000

    assertTrue(deduper.shouldPrefetch("stream-a", 4.0))
    assertFalse(deduper.shouldPrefetch("stream-a", 2.0))
  }

  @Test
  fun staleEntryCanPrefetchAgain() {
    var now = 1_000L
    val deduper = HlsPrefetchDeduper(windowMs = 60_000, maxEntries = 500) { now }

    assertTrue(deduper.shouldPrefetch("stream-a", 1.0))
    now += 60_001

    assertTrue(deduper.shouldPrefetch("stream-a", 1.0))
    assertEquals(1, deduper.size)
  }

  @Test
  fun freshChurnIsHardCapped() {
    val deduper = HlsPrefetchDeduper(windowMs = 60_000, maxEntries = 500) { 1_000L }

    repeat(550) { index ->
      assertTrue(deduper.shouldPrefetch("stream-$index", 1.0))
    }

    assertEquals(500, deduper.size)
  }

  @Test
  fun staleRefreshMovesKeyBehindOlderEntriesForEviction() {
    var now = 1_000L
    val deduper = HlsPrefetchDeduper(windowMs = 60_000, maxEntries = 2) { now }

    assertTrue(deduper.shouldPrefetch("stream-a", 1.0))
    assertTrue(deduper.shouldPrefetch("stream-b", 1.0))
    now += 60_001

    assertTrue(deduper.shouldPrefetch("stream-a", 1.0))
    assertTrue(deduper.shouldPrefetch("stream-c", 1.0))

    assertFalse(deduper.shouldPrefetch("stream-a", 1.0))
    assertTrue(deduper.shouldPrefetch("stream-b", 1.0))
  }

  @Test
  fun forgetAllowsImmediateRetryAfterFailure() {
    var now = 1_000L
    val deduper = HlsPrefetchDeduper(windowMs = 60_000, maxEntries = 500) { now }

    assertTrue(deduper.shouldPrefetch("stream-a", 1.0))
    now += 1_000
    deduper.forget("stream-a")

    assertTrue(deduper.shouldPrefetch("stream-a", 1.0))
  }
}
