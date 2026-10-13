package com.nitroplay.video.runtime

data class NativeSystemAudioEventSnapshot(
  val outputLossCount: Long,
  val revision: Long,
)

class NativeSystemAudioEventEngine(
  private val muteOutput: () -> Unit,
  private val stopManual: () -> Unit,
  private val stopUnbound: () -> Unit,
  private val notifyOutputDeviceLost: () -> Unit,
) {
  private val pendingOutputLossEvents = ArrayDeque<Unit>()
  private var isDraining = false
  private var outputLossCount = 0L
  private var revision = 0L

  val snapshot: NativeSystemAudioEventSnapshot
    get() = NativeSystemAudioEventSnapshot(
      outputLossCount = outputLossCount,
      revision = revision,
    )

  fun oldOutputDeviceBecameUnavailable() {
    pendingOutputLossEvents.addLast(Unit)
    if (isDraining) {
      return
    }

    isDraining = true
    while (pendingOutputLossEvents.isNotEmpty()) {
      pendingOutputLossEvents.removeFirst()
      outputLossCount += 1
      revision += 1
      muteOutput()
      stopManual()
      stopUnbound()
      notifyOutputDeviceLost()
    }
    isDraining = false
  }
}
