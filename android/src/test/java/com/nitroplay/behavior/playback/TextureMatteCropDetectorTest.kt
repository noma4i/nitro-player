package com.nitroplay.video.behavior.playback

import android.graphics.Bitmap
import android.graphics.Color
import com.nitroplay.video.view.TextureMatteCropDetector
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TextureMatteCropDetectorTest {
  @Test
  fun detectsVerticalMatteWithCenteredContent() {
    val result = TextureMatteCropDetector.detect(letterboxedBitmap()) ?: error("Expected matte crop")

    assertEquals(0.30f, result.activeTopFraction, 0.001f)
    assertEquals(0.30f, result.activeBottomFraction, 0.001f)
    assertEquals(0.40f, result.activeHeightFraction, 0.001f)
    assertEquals(2.5f, result.scale, 0.001f)
    assertEquals(0.5f, result.activeCenterYFraction, 0.001f)
  }

  @Test
  fun ignoresFramesWithoutLargeSymmetricMatte() {
    assertNull(TextureMatteCropDetector.detect(solidBitmap(Color.rgb(180, 20, 20))))
  }

  @Test
  fun capsExtremeMatteScale() {
    val result = TextureMatteCropDetector.detect(letterboxedBitmap(height = 100, contentTop = 40, contentBottom = 59)) ?: error("Expected matte crop")

    assertTrue(result.scale <= 3.5f)
  }

  private fun letterboxedBitmap(
    width: Int = 20,
    height: Int = 20,
    contentTop: Int = 6,
    contentBottom: Int = 13
  ): Bitmap {
    val pixels = IntArray(width * height) { index ->
      val y = index / width
      if (y in contentTop..contentBottom) Color.rgb(180, 20, 20) else Color.BLACK
    }
    return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
  }

  private fun solidBitmap(color: Int, width: Int = 20, height: Int = 20): Bitmap {
    return Bitmap.createBitmap(IntArray(width * height) { color }, width, height, Bitmap.Config.ARGB_8888)
  }
}
