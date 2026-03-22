package com.nitroplay.video

import android.os.Bundle
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import com.nitroplay.video.view.NitroPlayerView

class NitroPlayerViewTestActivity : ComponentActivity() {
  lateinit var videoView: NitroPlayerView
  lateinit var container: FrameLayout

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    videoView = NitroPlayerView(this).apply {
      nitroId = 101
      useController = true
    }

    container = FrameLayout(this).apply {
      addView(
        videoView,
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          600
        )
      )
    }

    setContentView(container)
  }
}
