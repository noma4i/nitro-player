package com.nitroplay.video.behavior.core

import com.nitroplay.video.runtime.PlaybackSuspensionRegistry
import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackSuspensionRegistryTest {
  private class Recorder {
    val acquired = mutableListOf<String>()
    val released = mutableListOf<String>()
    val registry = PlaybackSuspensionRegistry { key, groups ->
      val label = "$key:${(groups ?: emptyList()).joinToString(",")}"
      acquired.add(label)
      val release: () -> Unit = { released.add(label) }
      release
    }
  }

  @Test
  fun activeSetAcquiresOnceAndInactiveSetReleases() {
    val recorder = Recorder()

    recorder.registry.set("modal", true)
    recorder.registry.set("modal", true)
    assertEquals(listOf("modal:"), recorder.acquired)

    recorder.registry.set("modal", false)
    recorder.registry.set("modal", false)
    assertEquals(listOf("modal:"), recorder.released)
  }

  @Test
  fun changedAllowGroupsAcquireReplacementBeforeReleasingOldOne() {
    val recorder = Recorder()
    recorder.registry.set("modal", true, listOf("a"))

    recorder.registry.set("modal", true, listOf("b"))

    assertEquals(listOf("modal:a", "modal:b"), recorder.acquired)
    assertEquals(listOf("modal:a"), recorder.released)
  }

  @Test
  fun allowGroupsAreNormalizedSoOrderAndDuplicatesDoNotReacquire() {
    val recorder = Recorder()
    recorder.registry.set("k", true, listOf("b", "a", "a"))

    recorder.registry.set("k", true, listOf("a", "b"))

    assertEquals(listOf("k:a,b"), recorder.acquired)
    assertEquals(listOf("a", "b"), recorder.registry.snapshot().entries.first().allowGroups)
  }

  @Test
  fun clearByPrefixReleasesOnlyMatchingKeys() {
    val recorder = Recorder()
    recorder.registry.set("feed:1", true)
    recorder.registry.set("feed:2", true)
    recorder.registry.set("hero", true)

    recorder.registry.clear("feed:")

    assertEquals(listOf("feed:1:", "feed:2:"), recorder.released)
    assertEquals(listOf("hero"), recorder.registry.snapshot().entries.map { it.key })
  }
}
