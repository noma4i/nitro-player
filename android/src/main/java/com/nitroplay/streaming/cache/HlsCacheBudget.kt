package com.nitroplay.hls

object HlsCacheBudget {
    const val DEFAULT_MAX_BYTES: Long = 4L * 1024L * 1024L * 1024L
    const val MINIMUM_MAX_BYTES: Long = 64L * 1024L * 1024L

    fun normalize(bytes: Long): Long = bytes.coerceAtLeast(MINIMUM_MAX_BYTES)

    fun evictionTarget(maxBytes: Long): Long = (maxBytes * 90 / 100).coerceAtLeast(MINIMUM_MAX_BYTES)
}
