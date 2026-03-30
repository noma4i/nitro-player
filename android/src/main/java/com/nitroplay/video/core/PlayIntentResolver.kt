package com.nitroplay.video.core

enum class PlayPauseResolution { PLAYING, PAUSED, KEEP_CURRENT }

class PlayIntentResolver {
  var wantsToPlay = false
    private set

  fun onPlay() { wantsToPlay = true }
  fun onPause() { wantsToPlay = false }
  fun onEnded() { wantsToPlay = false }
  fun onError() { wantsToPlay = false }
  fun onSourceChange() { wantsToPlay = false }
  fun onRelease() { wantsToPlay = false }

  fun resolve(isPlaying: Boolean): PlayPauseResolution {
    if (isPlaying) return PlayPauseResolution.PLAYING
    if (wantsToPlay) return PlayPauseResolution.KEEP_CURRENT
    return PlayPauseResolution.PAUSED
  }
}
