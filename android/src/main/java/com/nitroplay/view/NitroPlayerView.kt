package com.nitroplay.video.view

import android.app.Activity
import android.annotation.SuppressLint
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageButton
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import com.facebook.react.bridge.ReactApplicationContext
import com.margelo.nitro.NitroModules
import com.margelo.nitro.video.HybridNitroPlayer
import com.margelo.nitro.video.ResizeMode
import com.margelo.nitro.video.SurfaceType
import com.margelo.nitro.video.NitroPlayerViewEventsEmitter
import com.nitroplay.video.support.errors.LibraryError
import com.nitroplay.video.player.NitroPlayerManager
import com.nitroplay.video.support.Threading.runOnMainThread
import com.nitroplay.video.view.toAspectRatioFrameLayout
import java.util.concurrent.atomic.AtomicLong
import com.nitroplay.video.R.layout.player_view_surface
import com.nitroplay.video.R.layout.player_view_texture

@UnstableApi
class NitroPlayerView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
  defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {
  companion object {
    private val nextAttachmentId = AtomicLong()
  }

  private val attachmentId = nextAttachmentId.incrementAndGet()

  @Volatile
  var isWindowAttached = false
    private set

  @Volatile
  var hybridPlayer: HybridNitroPlayer? = null
    set(value) {
      val current = field
      if (current === value) {
        return
      }
      if (isAttachedToWindow) {
        current?.notifyViewDetached(attachmentId)
      }
      if (current != null) {
        NitroPlayerManager.removeViewFromPlayer(this, current)
      }

      field = value

      field?.movePlayerToNitroPlayerView(this)
      if (isAttachedToWindow) {
        field?.notifyViewAttached(attachmentId)
      }
    }

  var nitroId: Int = -1
    set(value) {
      if (field == -1) {
        post {
          onNitroIdChange?.let { it(value) }
          NitroPlayerManager.registerView(this)
        }
      }

      NitroPlayerManager.updateNitroPlayerViewNitroId(oldNitroId = field, newNitroId = value, view = this)
      field = value
    }

  var useController: Boolean = false
    set(value) {
      field = value
      runOnMainThread {
        playerView.useController = value
      }
    }

  var surfaceType: SurfaceType = SurfaceType.SURFACE
    set(value) {
      if (field == value) return
      field = value

      runOnMainThread {
        val shouldKeepScreenAwake = playerView.keepScreenOn
        val previousPlayerView = playerView
        removeView(playerView)
        previousPlayerView.player = null
        playerView = createPlayerView()
        playerView.useController = useController
        playerView.keepScreenOn = shouldKeepScreenAwake
        applyResizeMode()
        addView(playerView)
        hybridPlayer?.movePlayerToNitroPlayerView(this)
        setupFullscreenButton()
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

  private val fullscreenManager = FullscreenDialogManager(this)

  var eventsEmitter: NitroPlayerViewEventsEmitter? = null

  var onNitroIdChange: ((Int?) -> Unit)? = null
  var playerView = createPlayerView()
  var isInFullscreen: Boolean
    get() = fullscreenManager.isActive
    set(value) { fullscreenManager.isActive = value }
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
    playerView.requestLayout()
    playerView.invalidate()
  }

  internal fun syncPlayerViewLayout() {
    applyResizeMode()
    requestLayout()
    invalidate()
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
    }
  }

  private val layoutRunnable = Runnable {
    measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
    )
    layout(left, top, right, bottom)
  }

  private fun detachPlayerViewSurface() {
    fullscreenManager.dismiss()
    removeCallbacks(layoutRunnable)
    playerView.player = null
    playerView.keepScreenOn = false
  }

  fun resetForDrop() {
    runOnMainThread {
      detachPlayerViewSurface()
      hybridPlayer = null
      useController = false
      eventsEmitter = null
      NitroPlayerManager.unregisterView(this)
    }
  }

  override fun requestLayout() {
    super.requestLayout()

    // https://github.com/facebook/react-native/blob/d19afc73f5048f81656d0b4424232ce6d69a6368/ReactAndroid/src/main/java/com/facebook/react/views/toolbar/ReactToolbar.java#L166
    // This fix issue where exoplayer views where wrong sizes
    // Without it, controls, PictureInPicture, content fills, etc. don't work
    post(layoutRunnable)
  }

  override fun onInterceptTouchEvent(event: MotionEvent?): Boolean {
    return useController && super.onInterceptTouchEvent(event)
  }

  override fun onTouchEvent(event: MotionEvent?): Boolean {
    return useController && super.onTouchEvent(event)
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
      val activity = resolveActivity() ?: return@runOnMainThread
      fullscreenManager.enter(activity)
      updateFullscreenButtonIcon()
    }
  }

  fun exitFullscreen() {
    runOnMainThread {
      if (!isInFullscreen) return@runOnMainThread
      eventsEmitter?.willExitFullscreen()
      fullscreenManager.dismiss()
      updateFullscreenButtonIcon()
    }
  }

  // -------- View Lifecycle Methods --------
  override fun onDetachedFromWindow() {
    try {
      detachPlayerViewSurface()
      hybridPlayer?.notifyViewDetached(attachmentId)
      eventsEmitter?.onDetached()
    } finally {
      isWindowAttached = false
      NitroPlayerManager.unregisterView(this)
      super.onDetachedFromWindow()
    }
  }

  override fun onAttachedToWindow() {
    isWindowAttached = true
    if (nitroId != -1) {
      NitroPlayerManager.registerView(this)
    }
    hybridPlayer?.movePlayerToNitroPlayerView(this)
    hybridPlayer?.notifyViewAttached(attachmentId)
    eventsEmitter?.onAttached()
    super.onAttachedToWindow()
  }

  internal fun resolveActivity(): Activity? {
    var currentContext: Context? = context
    while (currentContext is ContextWrapper) {
      if (currentContext is Activity) {
        return currentContext
      }
      currentContext = currentContext.baseContext
    }
    return null
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
