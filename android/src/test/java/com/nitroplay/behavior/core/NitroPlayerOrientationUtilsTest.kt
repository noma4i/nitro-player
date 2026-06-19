package com.nitroplay.video.core.utils

import com.margelo.nitro.video.NitroPlayerOrientation
import org.junit.Assert.assertEquals
import org.junit.Test

class NitroPlayerOrientationUtilsTest {

  @Test
  fun nullWidth_returnsUnknown() {
    assertEquals(NitroPlayerOrientation.UNKNOWN, NitroPlayerOrientationUtils.fromWHR(null, 100, 0))
  }

  @Test
  fun nullHeight_returnsUnknown() {
    assertEquals(NitroPlayerOrientation.UNKNOWN, NitroPlayerOrientationUtils.fromWHR(100, null, 0))
  }

  @Test
  fun zeroWidth_returnsUnknown() {
    assertEquals(NitroPlayerOrientation.UNKNOWN, NitroPlayerOrientationUtils.fromWHR(0, 100, 0))
  }

  @Test
  fun zeroHeight_returnsUnknown() {
    assertEquals(NitroPlayerOrientation.UNKNOWN, NitroPlayerOrientationUtils.fromWHR(100, 0, 0))
  }

  @Test
  fun squareVideo_returnsSquare() {
    assertEquals(NitroPlayerOrientation.SQUARE, NitroPlayerOrientationUtils.fromWHR(100, 100, 0))
  }

  @Test
  fun landscape_noRotation_returnsLandscapeRight() {
    assertEquals(NitroPlayerOrientation.LANDSCAPE_RIGHT, NitroPlayerOrientationUtils.fromWHR(1920, 1080, 0))
  }

  @Test
  fun portrait_noRotation_returnsPortrait() {
    assertEquals(NitroPlayerOrientation.PORTRAIT, NitroPlayerOrientationUtils.fromWHR(1080, 1920, 0))
  }

  @Test
  fun rotation90_returnsPortrait() {
    assertEquals(NitroPlayerOrientation.PORTRAIT, NitroPlayerOrientationUtils.fromWHR(1920, 1080, 90))
  }

  @Test
  fun rotation180_landscape_returnsLandscapeLeft() {
    assertEquals(NitroPlayerOrientation.LANDSCAPE_LEFT, NitroPlayerOrientationUtils.fromWHR(1920, 1080, 180))
  }

  @Test
  fun rotation180_portrait_returnsPortraitUpsideDown() {
    assertEquals(NitroPlayerOrientation.PORTRAIT_UPSIDE_DOWN, NitroPlayerOrientationUtils.fromWHR(1080, 1920, 180))
  }

  @Test
  fun rotation270_returnsPortraitUpsideDown() {
    assertEquals(NitroPlayerOrientation.PORTRAIT_UPSIDE_DOWN, NitroPlayerOrientationUtils.fromWHR(1920, 1080, 270))
  }

  @Test
  fun nullRotation_landscape_returnsLandscapeRight() {
    assertEquals(NitroPlayerOrientation.LANDSCAPE_RIGHT, NitroPlayerOrientationUtils.fromWHR(1920, 1080, null))
  }

  @Test
  fun nullRotation_portrait_returnsPortrait() {
    assertEquals(NitroPlayerOrientation.PORTRAIT, NitroPlayerOrientationUtils.fromWHR(1080, 1920, null))
  }

  @Test
  fun negativeRotation_normalizesCorrectly() {
    // -90 normalizes to 270
    assertEquals(NitroPlayerOrientation.PORTRAIT_UPSIDE_DOWN, NitroPlayerOrientationUtils.fromWHR(1920, 1080, -90))
  }

  @Test
  fun rotation360_normalizesToZero() {
    assertEquals(NitroPlayerOrientation.LANDSCAPE_RIGHT, NitroPlayerOrientationUtils.fromWHR(1920, 1080, 360))
  }
}
