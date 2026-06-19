package com.margelo.nitro.video

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class HybridNitroPlayerUriNormalizerTest {

  @Test
  fun normalize_absoluteFilesystemPath_returnsFileUri() {
    val normalized = HybridNitroPlayerUriNormalizer.normalize(
      "/data/user/0/com.yupi/cache/video.mp4",
      RuntimeEnvironment.getApplication()
    )

    assertEquals("file:///data/user/0/com.yupi/cache/video.mp4", normalized)
  }

  @Test
  fun normalize_networkUri_keepsOriginalValue() {
    val normalized = HybridNitroPlayerUriNormalizer.normalize(
      "https://cdn.example.com/video.mp4",
      RuntimeEnvironment.getApplication()
    )

    assertEquals("https://cdn.example.com/video.mp4", normalized)
  }

  @Test
  fun normalize_simpleName_stillTreatsValueAsRawResourceName() {
    val error = assertThrows(IllegalArgumentException::class.java) {
      HybridNitroPlayerUriNormalizer.normalize(
        "missing_resource_name",
        RuntimeEnvironment.getApplication()
      )
    }

    assertEquals("The video resource 'missing_resource_name' could not be found in res/raw", error.message)
  }
}
