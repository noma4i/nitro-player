package com.nitroplay.video.core.utils

import com.margelo.nitro.video.NitroPlayerOrientation

object NitroPlayerOrientationUtils {
  fun fromWHR(width: Int?, height: Int?, rotation: Int?): NitroPlayerOrientation {
    if (width == 0 || height == 0 || height == null || width == null) return NitroPlayerOrientation.UNKNOWN

    if (width == height) return NitroPlayerOrientation.SQUARE

    // Check if video is portrait or landscape using natural size
    val isNaturalSizePortrait = height > width

    // If rotation is not available, use natural size to determine orientation
    if (rotation == null) {
      return if (isNaturalSizePortrait) NitroPlayerOrientation.PORTRAIT else NitroPlayerOrientation.LANDSCAPE_RIGHT
    }

    // Normalize rotation to 0-360 range
    val normalizedRotation = ((rotation % 360) + 360) % 360

    return when (normalizedRotation) {
      0 -> if (isNaturalSizePortrait) NitroPlayerOrientation.PORTRAIT else NitroPlayerOrientation.LANDSCAPE_RIGHT
      90 -> NitroPlayerOrientation.PORTRAIT
      180 -> if (isNaturalSizePortrait) NitroPlayerOrientation.PORTRAIT_UPSIDE_DOWN else NitroPlayerOrientation.LANDSCAPE_LEFT
      270 -> NitroPlayerOrientation.PORTRAIT_UPSIDE_DOWN
      else -> if (isNaturalSizePortrait) NitroPlayerOrientation.PORTRAIT else NitroPlayerOrientation.LANDSCAPE_RIGHT
    }
  }
}
