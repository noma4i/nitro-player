package com.twg.video

import android.os.Build
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.margelo.nitro.video.HybridVideoViewViewManager
import com.twg.video.core.VideoManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class VideoViewRuntimeTest {
  @get:Rule
  val activityRule = ActivityScenarioRule(VideoViewTestActivity::class.java)

  @Test
  fun fullscreen_enterAndExit_updatesState() {
    activityRule.scenario.onActivity { activity ->
      InstrumentationRegistry.getInstrumentation().runOnMainSync {
        activity.videoView.enterFullscreen()
      }
      InstrumentationRegistry.getInstrumentation().waitForIdleSync()
      assertTrue(activity.videoView.isInFullscreen)

      InstrumentationRegistry.getInstrumentation().runOnMainSync {
        activity.videoView.exitFullscreen()
      }
      InstrumentationRegistry.getInstrumentation().waitForIdleSync()
      assertFalse(activity.videoView.isInFullscreen)
    }
  }

  @Test
  fun pipCapability_reflectsRuntimeSupport() {
    activityRule.scenario.onActivity { activity ->
      activity.videoView.pictureInPictureEnabled = false
      assertFalse(activity.videoView.canEnterPictureInPicture())

      activity.videoView.pictureInPictureEnabled = true
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        assertTrue(activity.videoView.canEnterPictureInPicture())
      }
    }
  }

  @Test
  fun hybridManager_delegatesPipCapabilityToView() {
    activityRule.scenario.onActivity { activity ->
      val manager = HybridVideoViewViewManager(activity.videoView.nitroId)
      val expected = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        activity.videoView.pictureInPictureEnabled

      assertTrue(manager.canEnterPictureInPicture() == expected)
    }
  }

  @Test
  fun detachAndAttach_reregistersViewByNitroId() {
    activityRule.scenario.onActivity { activity ->
      InstrumentationRegistry.getInstrumentation().runOnMainSync {
        activity.container.removeView(activity.videoView)
        activity.container.addView(activity.videoView)
      }
      InstrumentationRegistry.getInstrumentation().waitForIdleSync()

      val resolved = VideoManager
        .getVideoViewWeakReferenceByNitroId(activity.videoView.nitroId)
        ?.get()

      assertTrue(resolved === activity.videoView)
    }
  }
}
