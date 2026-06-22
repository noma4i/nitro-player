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
    // Builds the fingerprint straight from raw values so the 0.25s tick can decide
    // whether to emit without allocating a Nitro PlaybackState first (parity with iOS).
    fun fromValues(
      status: NitroPlayerStatus,
      currentTime: Double,
      duration: Double,
      bufferDuration: Double,
      bufferedPosition: Double,
      rate: Double,
      isPlaying: Boolean,
      isBuffering: Boolean,
      isVisualReady: Boolean,
      error: PlaybackError?
    ): PlaybackStateFingerprint = PlaybackStateFingerprint(
      status = status,
      currentTimeBits = currentTime.toBits(),
      durationBits = duration.toBits(),
      bufferDurationBits = bufferDuration.toBits(),
      bufferedPositionBits = bufferedPosition.toBits(),
      rateBits = rate.toBits(),
      isPlaying = isPlaying,
      isBuffering = isBuffering,
      isVisualReady = isVisualReady,
      errorCode = error?.code,
      errorMessageHash = error?.message?.hashCode()
    )

    fun from(state: PlaybackState): PlaybackStateFingerprint = fromValues(
      status = state.status,
      currentTime = state.currentTime,
      duration = state.duration,
      bufferDuration = state.bufferDuration,
      bufferedPosition = state.bufferedPosition,
      rate = state.rate,
      isPlaying = state.isPlaying,
      isBuffering = state.isBuffering,
      isVisualReady = state.isVisualReady,
      error = state.error?.asSecondOrNull()
    )
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
