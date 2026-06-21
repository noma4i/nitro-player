package com.nitroplay.video.core.utils

import android.content.Context
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import androidx.media3.ui.PlayerView

object SmallVideoPlayerOptimizer {

  fun isSmallVideoPlayer(playerView: PlayerView): Boolean {
    val width = playerView.width
    val height = playerView.height
    if (width <= 0 || height <= 0) return false
    return isSmallDimensions(width, height, playerView.context)
  }

  private fun isSmallDimensions(widthPx: Int, heightPx: Int, context: Context): Boolean {
    val density = context.resources.displayMetrics.density
    val widthDp = widthPx / density
    val heightDp = heightPx / density
    return widthDp <= 400 || heightDp <= 300
  }

  fun applyOptimizations(
    playerView: PlayerView,
    context: Context,
    isFullscreen: Boolean = false
  ) {
    playerView.post {
      try {
        if (isFullscreen) return@post
        if (!isSmallVideoPlayer(playerView)) return@post

        val density = context.resources.displayMetrics.density
        val primaryButtonSize = (48 * density).toInt()
        val secondaryButtonSize = (44 * density).toInt()

        optimizeButtons(playerView, primaryButtonSize, secondaryButtonSize)
        optimizeControlSizes(playerView, context)
      } catch (e: Exception) {
        Log.w("NitroPlay", "Error applying small video player optimizations: ${e.message}")
      }
    }
  }

  private fun optimizeButtons(
    playerView: PlayerView,
    primarySize: Int,
    secondarySize: Int
  ) {
    val primaryIds = setOf(
      androidx.media3.ui.R.id.exo_play_pause,
      androidx.media3.ui.R.id.exo_fullscreen,
      androidx.media3.ui.R.id.exo_settings
    )
    val secondaryIds = setOf(
      androidx.media3.ui.R.id.exo_rew,
      androidx.media3.ui.R.id.exo_ffwd,
      androidx.media3.ui.R.id.exo_subtitle,
      androidx.media3.ui.R.id.exo_prev,
      androidx.media3.ui.R.id.exo_next
    )
    val hiddenIds = setOf(
      androidx.media3.ui.R.id.exo_shuffle,
      androidx.media3.ui.R.id.exo_repeat_toggle,
      androidx.media3.ui.R.id.exo_vr
    )

    for (id in primaryIds + secondaryIds) {
      val button = playerView.findViewById<ImageButton>(id) ?: continue
      val size = if (id in primaryIds) primarySize else secondarySize
      button.layoutParams = button.layoutParams.apply { width = size; height = size }
    }

    for (id in hiddenIds) {
      playerView.findViewById<View>(id)?.visibility = View.GONE
    }
  }

  private fun optimizeControlSizes(playerView: PlayerView, context: Context) {
    val density = context.resources.displayMetrics.density

    playerView.findViewById<View>(androidx.media3.ui.R.id.exo_progress)?.let { progress ->
      (progress.layoutParams as? ViewGroup.MarginLayoutParams)?.let {
        it.height = (4 * density).toInt()
        progress.layoutParams = it
      }
    }

    val timeContainer = playerView.findViewById<ViewGroup>(androidx.media3.ui.R.id.exo_time)
    timeContainer?.let { time ->
      listOf(
        time.findViewById<View>(androidx.media3.ui.R.id.exo_position),
        time.findViewById<View>(androidx.media3.ui.R.id.exo_duration)
      ).forEach { view ->
        if (view is android.widget.TextView) {
          view.textSize = 12f
        }
      }
    }
  }
}
