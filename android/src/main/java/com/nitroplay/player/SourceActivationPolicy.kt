package com.margelo.nitro.video

internal enum class SourceActivationAction {
  IDLE,
  METADATA,
  BUFFERED,
  PLAY
}

internal object SourceActivationPolicy {
  fun resolve(
    startup: NitroSourceStartup,
    preload: PreloadLevel,
    shouldAutoPlay: Boolean
  ): SourceActivationAction {
    if (shouldAutoPlay) {
      return SourceActivationAction.PLAY
    }

    if (startup != NitroSourceStartup.EAGER) {
      return SourceActivationAction.IDLE
    }

    return when (preload) {
      PreloadLevel.NONE -> SourceActivationAction.IDLE
      PreloadLevel.METADATA -> SourceActivationAction.METADATA
      PreloadLevel.BUFFERED -> SourceActivationAction.BUFFERED
    }
  }
}
