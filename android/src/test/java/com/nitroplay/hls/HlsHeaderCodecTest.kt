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

  @Test
  fun encode_returnsNullForNullHeaders() {
    assertNull(HlsHeaderCodec.encode(null as Map<String, String>?))
  }

  @Test
  fun encode_returnsNullForEmptyHeaders() {
    assertNull(HlsHeaderCodec.encode(emptyMap()))
  }

  @Test
  fun decode_returnsNullForNullString() {
    assertNull(HlsHeaderCodec.decode(null as String?))
  }

  @Test
  fun decode_returnsNullForBlankString() {
    assertNull(HlsHeaderCodec.decode(""))
    assertNull(HlsHeaderCodec.decode("   "))
  }

  @Test
  fun encodeDecode_preservesSpecialCharacters() {
    val headers = mapOf(
      "Authorization" to "Bearer tok3n/with+special=chars",
      "X-Url" to "https://example.com?a=1&b=2"
    )

    val encoded = HlsHeaderCodec.encode(headers)
    val decoded = HlsHeaderCodec.decode(encoded)

    assertEquals(headers, decoded)
  }

  @Test
  fun encodeDecode_singleHeader() {
    val headers = mapOf("Key" to "Value")
    val encoded = HlsHeaderCodec.encode(headers)
    val decoded = HlsHeaderCodec.decode(encoded)
    assertEquals(headers, decoded)
  }

  @Test
  fun decodeUrl_returnsNullForNull() {
    assertNull(HlsHeaderCodec.decodeUrl(null))
  }

  @Test
  fun decodeUrl_returnsNullForBlank() {
    assertNull(HlsHeaderCodec.decodeUrl(""))
  }

  @Test
  fun decodeUrl_returnsValueForValidUrl() {
    assertEquals("https://example.com", HlsHeaderCodec.decodeUrl("https://example.com"))
  }
}
