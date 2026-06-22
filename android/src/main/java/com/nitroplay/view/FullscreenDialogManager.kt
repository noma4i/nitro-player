package com.nitroplay.video.view

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.util.UnstableApi
import com.nitroplay.video.view.SmallVideoPlayerOptimizer

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
    val activity = hostView.resolveActivity()
    if (activity != null && activity.isDestroyed) {
      // Activity is gone (config change / dismissed late): re-attaching to a dead
      // host would throw, so bail out and just mark the state inactive.
      isActive = false
      return
    }
    val playerView = hostView.playerView
    val dialogContent = dialog?.findViewById<FrameLayout>(android.R.id.content)
    (playerView.parent as? ViewGroup)?.removeView(playerView)
    dialogContent?.removeView(playerView)
    hostView.addView(playerView)
    isActive = false
  }

  fun dismiss() {
    try {
      if (isActive) {
        restore()
      }
    } finally {
      // Always tear the dialog down, even if restore() threw, so the Activity
      // is not leaked through a lingering Dialog reference.
      dialog?.dismiss()
      dialog = null
    }
  }
}
