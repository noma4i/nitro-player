package com.nitroplay.video

import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.nitroplay.video.core.NitroPlayerManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NitroPlayerViewRuntimeTest {
  @get:Rule
  val activityRule = ActivityScenarioRule(NitroPlayerViewTestActivity::class.java)

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
  fun detachAndAttach_reregistersViewByNitroId() {
    activityRule.scenario.onActivity { activity ->
      InstrumentationRegistry.getInstrumentation().runOnMainSync {
        activity.container.removeView(activity.videoView)
        activity.container.addView(activity.videoView)
      }
      InstrumentationRegistry.getInstrumentation().waitForIdleSync()

      val resolved = NitroPlayerManager
        .getNitroPlayerViewWeakReferenceByNitroId(activity.videoView.nitroId)
        ?.get()

      assertTrue(resolved === activity.videoView)
    }
  }
}
