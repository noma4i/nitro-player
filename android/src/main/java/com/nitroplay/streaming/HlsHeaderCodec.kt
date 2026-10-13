package com.nitroplay.video.streaming

import android.util.Base64
import java.nio.charset.StandardCharsets

object HlsHeaderCodec {
    fun encode(headers: Map<String, String>?): String? {
        if (headers == null || headers.isEmpty()) return null
        val json = org.json.JSONObject(headers).toString()
        return Base64.encodeToString(json.toByteArray(StandardCharsets.UTF_8), Base64.NO_WRAP)
    }

    fun decode(encoded: String?): Map<String, String>? {
        if (encoded.isNullOrBlank()) return null
        return try {
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            val json = String(bytes, StandardCharsets.UTF_8)
            val obj = org.json.JSONObject(json)
            val map = mutableMapOf<String, String>()
            obj.keys().forEach { key ->
                map[key] = obj.getString(key)
            }
            map
        } catch (_: Exception) {
            null
        }
    }

    // NanoHTTPD already URL-decodes query parameters; this only normalizes
    // null/blank values away, it does not decode.
    fun normalizeParam(value: String?): String? {
        if (value.isNullOrBlank()) return null
        return value
    }
}
