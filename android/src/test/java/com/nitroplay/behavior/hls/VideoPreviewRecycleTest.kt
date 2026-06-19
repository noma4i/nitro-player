package com.nitroplay.hls

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * NP-MEMORY-06: generatePreview() must recycle both the raw frame and the
 * scaled bitmap (when distinct) so the native bitmap memory is freed on the
 * success and error paths. These tests pin the scaleBitmap identity contract
 * that the recycle guard (`scaled !== rawBitmap`) relies on, then exercise that
 * guard against real (Robolectric-shadowed) bitmaps.
 */
@RunWith(AndroidJUnit4::class)
class VideoPreviewRecycleTest {

  private val profile = VideoPreviewProfile(maxWidth = 480, maxHeight = 480, quality = 70)

  @Test
  fun scaleBitmap_returnsSameInstance_whenWithinBounds() {
    val src = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888)
    val result = VideoPreviewRuntime.scaleBitmap(src, profile)
    assertSame("Within bounds -> same instance, so the recycle guard must not double-free it", src, result)
  }

  @Test
  fun scaleBitmap_returnsDistinctDownscaledInstance_whenExceedingBounds() {
    val src = Bitmap.createBitmap(1000, 1000, Bitmap.Config.ARGB_8888)
    val result = VideoPreviewRuntime.scaleBitmap(src, profile)
    assertNotSame(src, result)
    assertTrue(result.width <= 480 && result.height <= 480)
  }

  @Test
  fun recycleGuard_freesBothWhenScaledIsDistinct() {
    val raw = Bitmap.createBitmap(1000, 1000, Bitmap.Config.ARGB_8888)
    val scaled: Bitmap? = VideoPreviewRuntime.scaleBitmap(raw, profile)
    // Mirror generatePreview()'s finally block.
    if (scaled != null && scaled !== raw) scaled.recycle()
    raw.recycle()
    assertTrue(raw.isRecycled)
    assertTrue(scaled!!.isRecycled)
  }

  @Test
  fun recycleGuard_freesOnceWhenScaledIsSameInstance() {
    val raw = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888)
    val scaled: Bitmap? = VideoPreviewRuntime.scaleBitmap(raw, profile)
    if (scaled != null && scaled !== raw) scaled.recycle()
    raw.recycle()
    assertTrue(raw.isRecycled)
  }
}
