package com.nitroplay.hls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class HlsHeaderCodecTest {
  @Test
  fun encodeDecode_roundTripsHeaders() {
    val headers = mapOf(
      "Authorization" to "Bearer token",
      "X-Client" to "nitro-play"
    )

    val encoded = HlsHeaderCodec.encode(headers)
    val decoded = HlsHeaderCodec.decode(encoded)

    assertEquals(headers, decoded)
  }

  @Test
  fun decode_returnsNullForInvalidPayload() {
    assertNull(HlsHeaderCodec.decode("not-base64"))
  }
}
