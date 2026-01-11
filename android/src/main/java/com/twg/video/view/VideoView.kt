package com.twg.video.view

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.util.AttributeSet
import android.view.LayoutInflater
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
      enterFullscreen()
    }

    playerView.findViewById<ImageButton>(androidx.media3.ui.R.id.exo_fullscreen)
      ?.setImageResource(androidx.media3.ui.R.drawable.exo_ic_fullscreen_enter)
  }

  fun enterFullscreen() {
    return
  }

  fun exitFullscreen() {
    return
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
    return
  }

  internal fun internalEnterPictureInPicture(): Boolean {
    return false
  }

  fun exitPictureInPicture() {
    return
  }

  internal fun forceExitPictureInPicture() {
    return
  }

  // -------- View Lifecycle Methods --------
  override fun onDetachedFromWindow() {
    globalLayoutListener?.let { viewTreeObserver.removeOnGlobalLayoutListener(it) }
    globalLayoutListener = null
    removeCallbacks(layoutRunnable)
    VideoManager.unregisterView(this)
    super.onDetachedFromWindow()
  }

  override fun onAttachedToWindow() {
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
}
