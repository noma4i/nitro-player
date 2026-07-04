package com.nitroplay.video.view

import android.graphics.Bitmap
import android.graphics.Color

internal data class TextureMatteCropResult(
  val scale: Float,
  val activeTopFraction: Float,
  val activeBottomFraction: Float,
  val activeHeightFraction: Float,
  val activeCenterYFraction: Float,
  val sampleWidth: Int,
  val sampleHeight: Int
)

internal object TextureMatteCropDetector {
  private const val BLACK_LUMA_THRESHOLD = 18.0
  private const val ROW_CONTENT_RATIO_THRESHOLD = 0.08f
  private const val MIN_EDGE_MATTE_FRACTION = 0.12f
  private const val MIN_ACTIVE_HEIGHT_FRACTION = 0.20f
  private const val MAX_ACTIVE_HEIGHT_FRACTION = 0.78f
  private const val MAX_SCALE = 3.5f

  fun detect(bitmap: Bitmap): TextureMatteCropResult? {
    val width = bitmap.width
    val height = bitmap.height
    if (width <= 0 || height <= 0) {
      return null
    }

    val top = (0 until height).firstOrNull { rowHasContent(bitmap, it) } ?: return null
    val bottom = (height - 1 downTo 0).firstOrNull { rowHasContent(bitmap, it) } ?: return null
    if (bottom <= top) {
      return null
    }

    val activeHeight = bottom - top + 1
    val activeHeightFraction = activeHeight.toFloat() / height.toFloat()
    val topMatteFraction = top.toFloat() / height.toFloat()
    val bottomMatteFraction = (height - 1 - bottom).toFloat() / height.toFloat()

    if (
      topMatteFraction < MIN_EDGE_MATTE_FRACTION ||
      bottomMatteFraction < MIN_EDGE_MATTE_FRACTION ||
      activeHeightFraction < MIN_ACTIVE_HEIGHT_FRACTION ||
      activeHeightFraction > MAX_ACTIVE_HEIGHT_FRACTION
    ) {
      return null
    }

    val center = (top.toFloat() + bottom.toFloat() + 1f) / 2f / height.toFloat()
    return TextureMatteCropResult(
      scale = (1f / activeHeightFraction).coerceAtMost(MAX_SCALE),
      activeTopFraction = topMatteFraction,
      activeBottomFraction = bottomMatteFraction,
      activeHeightFraction = activeHeightFraction,
      activeCenterYFraction = center,
      sampleWidth = width,
      sampleHeight = height
    )
  }

  private fun rowHasContent(bitmap: Bitmap, y: Int): Boolean {
    var contentPixels = 0
    for (x in 0 until bitmap.width) {
      if (luma(bitmap.getPixel(x, y)) > BLACK_LUMA_THRESHOLD) {
        contentPixels += 1
      }
    }
    return contentPixels.toFloat() / bitmap.width.toFloat() >= ROW_CONTENT_RATIO_THRESHOLD
  }

  private fun luma(pixel: Int): Double {
    return Color.red(pixel) * 0.2126 + Color.green(pixel) * 0.7152 + Color.blue(pixel) * 0.0722
  }
}
