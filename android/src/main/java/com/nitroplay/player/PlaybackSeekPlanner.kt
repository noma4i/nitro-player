package com.margelo.nitro.video

internal object PlaybackSeekPlanner {
  fun applySeekBy(
    offset: Double,
    readCurrentTime: () -> Double,
    readDuration: () -> Double,
    seekToPositionMs: (Long) -> Unit
  ) {
    val currentTime = readCurrentTime()
    val duration = readDuration()
    seekToPositionMs(positionMsForTarget(targetForSeekBy(currentTime, offset, duration), duration))
  }

  fun applySeekTo(
    targetTime: Double,
    readDuration: () -> Double,
    seekToPositionMs: (Long) -> Unit
  ) {
    val duration = readDuration()
    seekToPositionMs(positionMsForTarget(targetForSeekTo(targetTime, duration), duration))
  }

  fun targetForSeekBy(currentTime: Double, offset: Double, duration: Double): Double {
    return (currentTime + offset).coerceIn(0.0, safeDuration(duration))
  }

  fun targetForSeekTo(targetTime: Double, duration: Double): Double {
    return targetTime.coerceIn(0.0, safeDuration(duration))
  }

  fun positionMsForTarget(targetTime: Double, duration: Double): Long {
    val positiveValue = if (targetTime.isFinite()) kotlin.math.max(0.0, targetTime) else 0.0
    val clamped = if (duration.isFinite() && duration > 0.0) {
      kotlin.math.min(positiveValue, duration)
    } else {
      positiveValue
    }
    return (clamped * 1000).toLong().coerceAtLeast(0L)
  }

  private fun safeDuration(duration: Double): Double {
    return if (duration.isNaN()) Double.MAX_VALUE else duration
  }
}
