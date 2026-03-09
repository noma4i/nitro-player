package com.twg.video.view

import android.app.Activity
import android.app.Dialog
import android.annotation.SuppressLint
import android.app.PictureInPictureParams
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.os.Build
import android.util.Rational
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageButton
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import com.facebook.react.bridge.ReactApplicationContext
import com.margelo.nitro.NitroModules
import com.margelo.nitro.video.HybridVideoPlayer
import com.margelo.nitro.video.ResizeMode
import com.margelo.nitro.video.SurfaceType
import com.margelo.nitro.video.VideoViewEventsEmitter
import com.twg.video.core.LibraryError
import com.twg.video.core.VideoManager
import com.twg.video.core.utils.Threading.runOnMainThread
import com.twg.video.core.extensions.toAspectRatioFrameLayout
import com.twg.video.core.utils.SmallVideoPlayerOptimizer
import android.view.ViewTreeObserver
import com.twg.video.R.layout.player_view_surface
import com.twg.video.R.layout.player_view_texture

@UnstableApi
class VideoView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
  defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {
  var hybridPlayer: HybridVideoPlayer? = null
    set(value) {
      // Clear the SurfaceView when player is about to be set to null
      if (value == null && field != null) {
        VideoManager.removeViewFromPlayer(this, field!!)
      }

      field = value

      field?.movePlayerToVideoView(this)
    }

  var nitroId: Int = -1
    set(value) {
      if (field == -1) {
        post {
          onNitroIdChange?.let { it(value) }
          VideoManager.registerView(this)
        }
      }

      VideoManager.updateVideoViewNitroId(oldNitroId = field, newNitroId = value, view = this)
      field = value
    }

  var autoEnterPictureInPicture: Boolean = false
    set(value) {
      field = value
    }

  var useController: Boolean = false
    set(value) {
      field = value
      runOnMainThread {
        playerView.useController = value
      }
    }

  var pictureInPictureEnabled: Boolean = false

  var surfaceType: SurfaceType = SurfaceType.SURFACE
    set(value) {
      if (field == value) return
      field = value

      runOnMainThread {
        val shouldKeepScreenAwake = playerView.keepScreenOn
        val nextPlayer = hybridPlayer?.player
        removeView(playerView)
        playerView.player = null
        playerView = createPlayerView()
        playerView.useController = useController
        playerView.keepScreenOn = shouldKeepScreenAwake
        applyResizeMode()
        addView(playerView)
        playerView.player = nextPlayer
      }
    }

  var resizeMode: ResizeMode = ResizeMode.NONE
    set(value) {
      field = value
      runOnMainThread {
        applyResizeMode()
      }
    }

  var keepScreenAwake: Boolean
    get() = playerView.keepScreenOn
    set(value) {
      runOnMainThread {
        playerView.keepScreenOn = value
      }
    }

  private var globalLayoutListener: ViewTreeObserver.OnGlobalLayoutListener? = null
  private var fullscreenDialog: Dialog? = null

  var eventsEmitter: VideoViewEventsEmitter? = null

  var onNitroIdChange: ((Int?) -> Unit)? = null
  var playerView = createPlayerView()
  var isInFullscreen: Boolean = false
    set(value) {
      if (value != field) {
        eventsEmitter?.onFullscreenChange(value)
      }
      field = value
    }
  var isInPictureInPicture: Boolean = false
    set(value) {
      field = value
      
      if (value) {
        playerView.useController = false
        playerView.controllerAutoShow = false
        playerView.controllerHideOnTouch = true
      } else {
        playerView.useController = useController
        playerView.controllerAutoShow = true
        playerView.controllerHideOnTouch = true
      }
      
      eventsEmitter?.onPictureInPictureChange(value)
    }

  val applicationContent: ReactApplicationContext
    get() {
      return NitroModules.applicationContext ?: throw LibraryError.ApplicationContextNotFound
    }

  init {
    addView(playerView)
    setupFullscreenButton()
    applyResizeMode()
  }

  private fun applyResizeMode() {
    playerView.resizeMode = resizeMode.toAspectRatioFrameLayout()
  }

  @SuppressLint("InflateParams")
  private fun createPlayerView(): PlayerView {
    return when (surfaceType) {
      SurfaceType.SURFACE -> LayoutInflater.from(context).inflate(player_view_surface, null) as PlayerView
      SurfaceType.TEXTURE -> LayoutInflater.from(context).inflate(player_view_texture, null) as PlayerView
    }.apply {
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      setShutterBackgroundColor(Color.TRANSPARENT)
      setShowSubtitleButton(true)
      useController = false

      // Apply optimizations based on video player size if needed
      configureForSmallPlayer()
    }
  }

  private val layoutRunnable = Runnable {
    measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
    )
    layout(left, top, right, bottom)

    // Additional layout fixes for small video players
    applySmallPlayerLayoutFixes()
  }

  override fun requestLayout() {
    super.requestLayout()

    // https://github.com/facebook/react-native/blob/d19afc73f5048f81656d0b4424232ce6d69a6368/ReactAndroid/src/main/java/com/facebook/react/views/toolbar/ReactToolbar.java#L166
    // This fix issue where exoplayer views where wrong sizes
    // Without it, controls, PictureInPicture, content fills, etc. don't work
    post(layoutRunnable)
  }

  @SuppressLint("PrivateResource")
  private fun setupFullscreenButton() {
    playerView.setFullscreenButtonClickListener { _ ->
      if (isInFullscreen) {
        exitFullscreen()
      } else {
        enterFullscreen()
      }
    }
    updateFullscreenButtonIcon()
  }

  fun enterFullscreen() {
    runOnMainThread {
      if (isInFullscreen) return@runOnMainThread

      val activity = resolveActivity() ?: return@runOnMainThread
      val currentParent = playerView.parent as? ViewGroup ?: return@runOnMainThread

      eventsEmitter?.willEnterFullscreen()

      currentParent.removeView(playerView)

      val dialog = Dialog(
        activity,
        android.R.style.Theme_Black_NoTitleBar_Fullscreen
      )
      val fullscreenContainer = FrameLayout(activity).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        setBackgroundColor(Color.BLACK)
      }

      fullscreenContainer.addView(
        playerView,
        FrameLayout.LayoutParams(
          LayoutParams.MATCH_PARENT,
          LayoutParams.MATCH_PARENT
        )
      )

      dialog.setContentView(fullscreenContainer)
      dialog.setCancelable(true)
      dialog.setOnDismissListener {
        if (isInFullscreen) {
          restoreFromFullscreen()
        }
      }

      fullscreenDialog = dialog
      dialog.show()

      isInFullscreen = true
      updateFullscreenButtonIcon()
      SmallVideoPlayerOptimizer.applyOptimizations(
        playerView,
        context,
        isFullscreen = true
      )
    }
  }

  fun exitFullscreen() {
    runOnMainThread {
      if (!isInFullscreen) return@runOnMainThread

      eventsEmitter?.willExitFullscreen()
      restoreFromFullscreen()
      fullscreenDialog?.dismiss()
      fullscreenDialog = null
    }
  }

  private fun setupPipHelper() {
    return
  }

  private fun removePipHelper() {
    return
  }

  private fun removeFullscreenFragment() {
    return
  }

  fun hideRootContentViews() {
    return
  }

  fun restoreRootContentViews() {
    return
  }

  fun enterPictureInPicture() {
    runOnMainThread {
      if (!canEnterPictureInPicture()) {
        return@runOnMainThread
      }

      VideoManager.requestPictureInPicture(this)
    }
  }

  internal fun internalEnterPictureInPicture(): Boolean {
    if (!canEnterPictureInPicture()) {
      return false
    }

    val activity = resolveActivity() ?: return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return false
    }

    eventsEmitter?.willEnterPictureInPicture()

    val width = playerView.width.takeIf { it > 0 } ?: 16
    val height = playerView.height.takeIf { it > 0 } ?: 9
    val paramsBuilder = PictureInPictureParams.Builder()
      .setAspectRatio(Rational(width, height))

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      paramsBuilder.setAutoEnterEnabled(autoEnterPictureInPicture)
    }

    val entered = activity.enterPictureInPictureMode(paramsBuilder.build())

    if (entered) {
      isInPictureInPicture = true
    }

    return entered
  }

  fun exitPictureInPicture() {
    runOnMainThread {
      if (!isInPictureInPicture) return@runOnMainThread

      eventsEmitter?.willExitPictureInPicture()
      isInPictureInPicture = false
      VideoManager.notifyPictureInPictureExited(this)
    }
  }

  internal fun forceExitPictureInPicture() {
    exitPictureInPicture()
  }

  // -------- View Lifecycle Methods --------
  override fun onDetachedFromWindow() {
    try {
      if (isInFullscreen) {
        restoreFromFullscreen()
        fullscreenDialog?.dismiss()
        fullscreenDialog = null
      }
      if (isInPictureInPicture) {
        isInPictureInPicture = false
        VideoManager.notifyPictureInPictureExited(this)
      }
      globalLayoutListener?.let { viewTreeObserver.removeOnGlobalLayoutListener(it) }
      globalLayoutListener = null
      removeCallbacks(layoutRunnable)
      hybridPlayer?.notifyViewDetached()
    } finally {
      VideoManager.unregisterView(this)
      super.onDetachedFromWindow()
    }
  }

  override fun onAttachedToWindow() {
    if (nitroId != -1) {
      VideoManager.registerView(this)
    }
    hybridPlayer?.notifyViewAttached()
    hybridPlayer?.movePlayerToVideoView(this)
    super.onAttachedToWindow()
  }

  private fun PlayerView.configureForSmallPlayer() {
    SmallVideoPlayerOptimizer.applyOptimizations(this, context, isFullscreen = false)

    // Also apply after any layout changes
    val listener = ViewTreeObserver.OnGlobalLayoutListener {
      SmallVideoPlayerOptimizer.applyOptimizations(this, context, isFullscreen = false)
    }
    globalLayoutListener?.let { viewTreeObserver.removeOnGlobalLayoutListener(it) }
    globalLayoutListener = listener
    viewTreeObserver.addOnGlobalLayoutListener(listener)
  }

  private fun applySmallPlayerLayoutFixes() {
    SmallVideoPlayerOptimizer.applyOptimizations(playerView, context, isFullscreen = false)
  }

  fun canEnterPictureInPicture(): Boolean {
    if (!pictureInPictureEnabled || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return false
    }

    val activity = resolveActivity() ?: return false
    return activity.packageManager.hasSystemFeature(
      android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE
    )
  }

  private fun resolveActivity(): Activity? {
    var currentContext: Context? = context
    while (currentContext is ContextWrapper) {
      if (currentContext is Activity) {
        return currentContext
      }
      currentContext = currentContext.baseContext
    }
    return null
  }

  private fun restoreFromFullscreen() {
    val dialogContent = fullscreenDialog?.findViewById<FrameLayout>(android.R.id.content)
    (playerView.parent as? ViewGroup)?.removeView(playerView)
    dialogContent?.removeView(playerView)
    addView(playerView)
    isInFullscreen = false
    updateFullscreenButtonIcon()
    applySmallPlayerLayoutFixes()
  }

  @SuppressLint("PrivateResource")
  private fun updateFullscreenButtonIcon() {
    val iconRes = if (isInFullscreen) {
      androidx.media3.ui.R.drawable.exo_ic_fullscreen_exit
    } else {
      androidx.media3.ui.R.drawable.exo_ic_fullscreen_enter
    }

    playerView.findViewById<ImageButton>(androidx.media3.ui.R.id.exo_fullscreen)
      ?.setImageResource(iconRes)
  }
}
