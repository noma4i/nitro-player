package com.nitroplay.video.behavior.playback

import com.margelo.nitro.video.NitroPlayerPlaybackConfig
import com.margelo.nitro.video.PlayerAllocatorPool
import com.margelo.nitro.video.PlayerInstanceReusePolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerInstanceReuseBehaviorTest {
  private data class Engine(
    val id: Int,
    var mediaUri: String? = null,
    var playWhenReady: Boolean = false
  )

  @Test
  fun sourceChangeReuseKeepsPlayerInstanceAndTargetsNewItem() {
    var engine = Engine(id = 1, mediaUri = "first.mp4", playWhenReady = false)
    val firstEngine = engine
    val shouldRebuild = PlayerInstanceReusePolicy.shouldRebuildForSourceChange(
      forceRebuild = false,
      reuseForSourceChanges = PlayerInstanceReusePolicy.DEFAULT_REUSE_PLAYER_INSTANCE_FOR_SOURCE_CHANGES,
      nextPlaybackConfig = NitroPlayerPlaybackConfig.from(null),
      activePlaybackConfig = NitroPlayerPlaybackConfig.from(null),
      hasAllocator = true
    )

    if (shouldRebuild) {
      engine = Engine(id = 2)
    }
    engine.mediaUri = "second.mp4"
    engine.playWhenReady = true

    assertSame(firstEngine, engine)
    assertEquals("second.mp4", engine.mediaUri)
    assertTrue(engine.playWhenReady)
  }

  @Test
  fun fatalRecoveryForceRebuildSwapsPlayerInstance() {
    var engine = Engine(id = 1, mediaUri = "recover.mp4")
    val firstEngine = engine
    val shouldRebuild = PlayerInstanceReusePolicy.shouldRebuildForSourceChange(
      forceRebuild = true,
      reuseForSourceChanges = PlayerInstanceReusePolicy.DEFAULT_REUSE_PLAYER_INSTANCE_FOR_SOURCE_CHANGES,
      nextPlaybackConfig = NitroPlayerPlaybackConfig.from(null),
      activePlaybackConfig = NitroPlayerPlaybackConfig.from(null),
      hasAllocator = true
    )

    if (shouldRebuild) {
      engine = Engine(id = 2, mediaUri = "recover.mp4")
    }

    assertNotSame(firstEngine, engine)
  }

  @Test
  fun allocatorSurvivesReplacePlayerInstance() {
    val firstAllocator = PlayerAllocatorPool.currentOrCreate(null)
    val replacementAllocator = PlayerAllocatorPool.currentOrCreate(firstAllocator)

    assertSame(firstAllocator, replacementAllocator)
  }

  @Test
  fun retentionTrimStillReleasesPlayerInstance() {
    assertTrue(PlayerInstanceReusePolicy.shouldReleaseForRetentionTrim())
  }
}
