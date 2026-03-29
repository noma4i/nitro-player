package com.nitroplay.video.view

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.util.UnstableApi
import com.nitroplay.video.core.utils.SmallVideoPlayerOptimizer

@UnstableApi
internal class FullscreenDialogManager(
  private val hostView: NitroPlayerView
) {
  var dialog: Dialog? = null
  var isActive: Boolean = false
    set(value) {
      if (value != field) {
        hostView.eventsEmitter?.onFullscreenChange(value)
      }
      field = value
    }

  fun enter(activity: Activity) {
    if (isActive) return
    if (activity.isFinishing || activity.isDestroyed) return
    val playerView = hostView.playerView
    val currentParent = playerView.parent as? ViewGroup ?: return

    hostView.eventsEmitter?.willEnterFullscreen()

    currentParent.removeView(playerView)

    val newDialog = Dialog(
      activity,
      android.R.style.Theme_Black_NoTitleBar_Fullscreen
    )
    val fullscreenContainer = FrameLayout(activity).apply {
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
      setBackgroundColor(Color.BLACK)
    }

    fullscreenContainer.addView(
      playerView,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    )

    newDialog.setContentView(fullscreenContainer)
    newDialog.setCancelable(true)
    newDialog.setOnDismissListener {
      if (isActive) {
        restore()
      }
    }

    dialog = newDialog
    newDialog.show()

    isActive = true
    SmallVideoPlayerOptimizer.applyOptimizations(
      playerView,
      hostView.context,
      isFullscreen = true
    )
  }

  fun restore() {
    val playerView = hostView.playerView
    val dialogContent = dialog?.findViewById<FrameLayout>(android.R.id.content)
    (playerView.parent as? ViewGroup)?.removeView(playerView)
    dialogContent?.removeView(playerView)
    hostView.addView(playerView)
    isActive = false
  }

  fun dismiss() {
    if (isActive) {
      restore()
    }
    dialog?.dismiss()
    dialog = null
  }
}
