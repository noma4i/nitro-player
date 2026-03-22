package com.nitroplay.hls

import android.util.Base64
import com.facebook.react.bridge.ReadableMap
import java.nio.charset.StandardCharsets

object HlsHeaderCodec {
    fun encode(headers: Map<String, String>?): String? {
        if (headers == null || headers.isEmpty()) return null
        val json = org.json.JSONObject(headers).toString()
        return Base64.encodeToString(json.toByteArray(StandardCharsets.UTF_8), Base64.NO_WRAP)
    }

    fun encode(headers: ReadableMap?): String? {
        if (headers == null || headers.toHashMap().isEmpty()) return null
        val json = org.json.JSONObject(headers.toHashMap()).toString()
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

    fun decode(map: ReadableMap?): Map<String, String>? {
        if (map == null) return null
        return map.toHashMap().mapValues { it.value.toString() }
    }

    fun decodeUrl(value: String?): String? {
        if (value.isNullOrBlank()) return null
        return value
    }
}
