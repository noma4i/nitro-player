package com.margelo.nitro.video

internal object PlaybackStateEmissionCoordinator {
  fun shouldBuildSnapshot(
    canEmitForLifecycle: Boolean,
    hasPlaybackStateListeners: Boolean
  ): Boolean {
    return canEmitForLifecycle && hasPlaybackStateListeners
  }
}
