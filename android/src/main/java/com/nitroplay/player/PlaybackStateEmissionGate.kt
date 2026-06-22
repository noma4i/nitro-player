package com.margelo.nitro.video

internal data class PlaybackStateFingerprint(
  val status: NitroPlayerStatus,
  val currentTimeBits: Long,
  val durationBits: Long,
  val bufferDurationBits: Long,
  val bufferedPositionBits: Long,
  val rateBits: Long,
  val isPlaying: Boolean,
  val isBuffering: Boolean,
  val isVisualReady: Boolean,
  val errorCode: NitroPlayerErrorCode?,
  val errorMessageHash: Int?
) {
  companion object {
    fun from(state: PlaybackState): PlaybackStateFingerprint {
      val error = state.error?.asSecondOrNull()
      return PlaybackStateFingerprint(
        status = state.status,
        currentTimeBits = state.currentTime.toBits(),
        durationBits = state.duration.toBits(),
        bufferDurationBits = state.bufferDuration.toBits(),
        bufferedPositionBits = state.bufferedPosition.toBits(),
        rateBits = state.rate.toBits(),
        isPlaying = state.isPlaying,
        isBuffering = state.isBuffering,
        isVisualReady = state.isVisualReady,
        errorCode = error?.code,
        errorMessageHash = error?.message?.hashCode()
      )
    }
  }
}

internal class PlaybackStateEmissionGate {
  private val lock = Any()
  private var lastFingerprint: PlaybackStateFingerprint? = null

  fun shouldEmit(fingerprint: PlaybackStateFingerprint): Boolean {
    synchronized(lock) {
      if (fingerprint == lastFingerprint) {
        return false
      }
      lastFingerprint = fingerprint
      return true
    }
  }

  fun reset() {
    synchronized(lock) {
      lastFingerprint = null
    }
  }
}
