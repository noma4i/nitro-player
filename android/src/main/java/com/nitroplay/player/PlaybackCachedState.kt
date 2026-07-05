package com.margelo.nitro.video

internal class PlaybackCachedState {
  @Volatile
  var loop: Boolean = false

  @Volatile
  var muted: Boolean = false

  @Volatile
  var rate: Double = 1.0

  @Volatile
  var isBuffering: Boolean = false

  @Volatile
  var isVisualReady: Boolean = false
}
