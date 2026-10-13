package com.nitroplay.video.streaming.cache

internal object HlsCacheContentValidator {
    private val ISOBmffBoxes = setOf("ftyp", "styp", "moof", "sidx")

    fun isCacheableSegment(data: ByteArray): Boolean {
        if (data.isEmpty()) {
            return false
        }
        return isMpegTs(data) || isIsoBmff(data)
    }

    private fun isMpegTs(data: ByteArray): Boolean {
        if (data[0] != 0x47.toByte()) {
            return false
        }
        return data.size < 189 || data[188] == 0x47.toByte()
    }

    private fun isIsoBmff(data: ByteArray): Boolean {
        if (data.size < 8) {
            return false
        }
        val boxSize = readUInt32(data, 0)
        if (boxSize < 8L && boxSize != 1L) {
            return false
        }
        val boxType = String(data, 4, 4, Charsets.US_ASCII)
        return boxType in ISOBmffBoxes
    }

    private fun readUInt32(data: ByteArray, offset: Int): Long {
        return ((data[offset].toLong() and 0xFFL) shl 24) or
            ((data[offset + 1].toLong() and 0xFFL) shl 16) or
            ((data[offset + 2].toLong() and 0xFFL) shl 8) or
            (data[offset + 3].toLong() and 0xFFL)
    }
}
