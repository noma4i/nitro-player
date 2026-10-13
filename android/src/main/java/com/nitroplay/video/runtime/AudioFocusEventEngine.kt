package com.nitroplay.video.runtime

class AudioFocusEventEngine(
  private val acquireSuspension: () -> (() -> Unit),
  private val stopCoordinated: () -> Unit,
  private val pauseUnboundTransient: () -> Unit,
  private val resumeUnboundTransient: () -> Unit,
  private val stopUnbound: () -> Unit,
  private val duck: () -> Unit,
  private val unduck: () -> Unit
) {
  private var transientSuspensionActive = false
  private var releaseTransientSuspension: (() -> Unit)? = null
  private var permanentLossHandling = false
  private var ducking = false

  val blocksReconciliation: Boolean
    get() = transientSuspensionActive || permanentLossHandling

  private fun clearTransientSuspension() {
    transientSuspensionActive = false
    val release = releaseTransientSuspension
    releaseTransientSuspension = null
    release?.invoke()
    resumeUnboundTransient()
  }

  fun onGain() {
    if (ducking) {
      ducking = false
      unduck()
    }

    if (!transientSuspensionActive) {
      return
    }

    clearTransientSuspension()
  }

  fun resolveInterruptionIfStillActive() {
    if (!transientSuspensionActive) {
      return
    }

    clearTransientSuspension()
  }

  fun onPermanentLoss() {
    permanentLossHandling = true
    try {
      if (ducking) {
        ducking = false
        unduck()
      }

      try {
        stopCoordinated()
      } finally {
        try {
          stopUnbound()
        } finally {
          releaseTransientSuspension?.invoke()
        }
      }
    } finally {
      transientSuspensionActive = false
      releaseTransientSuspension = null
      ducking = false
      permanentLossHandling = false
    }
  }

  fun onAbandoned() {
    permanentLossHandling = true
    try {
      if (ducking) {
        ducking = false
        unduck()
      }

      if (transientSuspensionActive) {
        transientSuspensionActive = false
        val release = releaseTransientSuspension
        releaseTransientSuspension = null
        release?.invoke()
      }
    } finally {
      transientSuspensionActive = false
      releaseTransientSuspension = null
      ducking = false
      permanentLossHandling = false
    }
  }

  fun onTransientLoss() {
    if (transientSuspensionActive) {
      return
    }

    transientSuspensionActive = true
    if (ducking) {
      ducking = false
      unduck()
    }
    releaseTransientSuspension = acquireSuspension()
    pauseUnboundTransient()
  }

  fun onDuckLoss(shouldPause: Boolean) {
    if (shouldPause) {
      onTransientLoss()
      return
    }

    if (ducking || transientSuspensionActive) {
      return
    }

    ducking = true
    duck()
  }
}
