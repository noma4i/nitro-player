package com.twg.video

import android.os.Bundle
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import com.twg.video.view.VideoView

class VideoViewTestActivity : ComponentActivity() {
  lateinit var videoView: VideoView
  lateinit var container: FrameLayout

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    videoView = VideoView(this).apply {
      nitroId = 101
      pictureInPictureEnabled = true
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
