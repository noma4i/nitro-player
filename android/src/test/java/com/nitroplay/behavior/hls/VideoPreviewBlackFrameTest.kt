package com.nitroplay.video.behavior.hls

import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import com.nitroplay.video.preview.VideoPreviewRuntime

/**
 * NP-PREVIEW-01 (Android parity): isMostlyBlack drives the multi-offset frame
 * selection so an intro fade does not yield a black thumbnail. Mirrors the iOS
 * PreviewFrameHeuristicsTests coverage.
 */
@RunWith(AndroidJUnit4::class)
class VideoPreviewBlackFrameTest {

  private fun solid(color: Int, w: Int = 8, h: Int = 8): Bitmap {
    val colors = IntArray(w * h) { color }
    return Bitmap.createBitmap(colors, w, h, Bitmap.Config.ARGB_8888)
  }

  @Test
  fun isMostlyBlack_trueForBlackBitmap() {
    assertTrue(VideoPreviewRuntime.isMostlyBlack(solid(Color.BLACK)))
  }

  @Test
  fun isMostlyBlack_falseForWhiteBitmap() {
    assertFalse(VideoPreviewRuntime.isMostlyBlack(solid(Color.WHITE)))
  }

  @Test
  fun isMostlyBlack_falseForMidGray() {
    assertFalse(VideoPreviewRuntime.isMostlyBlack(solid(Color.rgb(80, 80, 80))))
  }

  @Test
  fun isMostlyBlack_trueForNearBlackBelowThreshold() {
    // luma(15,15,15) = 15 < 18 -> treated as black
    assertTrue(VideoPreviewRuntime.isMostlyBlack(solid(Color.rgb(15, 15, 15))))
  }
}
