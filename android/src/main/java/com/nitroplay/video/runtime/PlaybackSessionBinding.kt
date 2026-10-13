package com.nitroplay.video.runtime

data class PlaybackSessionBindingSnapshot(
  val key: String?,
  val leaseId: Long?,
  val policy: PlaybackSessionPolicy?,
  val eligible: Boolean,
  val requested: Boolean,
  val desiredPlayback: Boolean,
  val released: Boolean,
)

object PlaybackEligibility {
  fun resolve(active: Boolean, visible: Boolean, attached: Boolean, requiresView: Boolean): Boolean =
    active && visible && (!requiresView || attached)
}

class PlaybackSessionBinding(
  private val coordinator: PlaybackSessionCoordinator,
  private val play: () -> Unit,
  private val pause: () -> Unit,
  private val idle: () -> Unit,
) {
  private var key: String? = null
  private var leaseId: Long? = null
  private var policy: PlaybackSessionPolicy? = null
  private var eligible = false
  private var requested = false
  private var released = false

  fun configure(key: String, policy: PlaybackSessionPolicy) {
    if (released || (this.key == key && this.policy == policy)) {
      return
    }

    val oldKey = this.key
    val oldLeaseId = leaseId
    if (oldKey != null && oldLeaseId != null) {
      coordinator.unregister(oldKey, oldLeaseId)
    }

    this.key = key
    this.policy = policy
    leaseId = coordinator.register(key, policy, ::handle)
    syncIntent()
  }

  fun updateEligibility(eligible: Boolean) {
    if (released || this.eligible == eligible) {
      return
    }

    this.eligible = eligible
    syncIntent()
  }

  fun requestPlay() {
    val currentKey = key ?: return
    val currentLeaseId = leaseId ?: return
    if (released) {
      return
    }

    if (!requested) {
      requested = true
      syncIntent()
      return
    }

    if (eligible && coordinator.isActive(currentKey, currentLeaseId)) {
      play()
    }
  }

  fun requestIdle() {
    if (released || !requested) {
      return
    }

    requested = false
    syncIntent()
  }

  fun release() {
    if (released) {
      return
    }

    val currentKey = key
    val currentLeaseId = leaseId
    if (currentKey != null && currentLeaseId != null) {
      coordinator.unregister(currentKey, currentLeaseId)
    }
    released = true
    key = null
    leaseId = null
    policy = null
    requested = false
  }

  fun snapshot(): PlaybackSessionBindingSnapshot = PlaybackSessionBindingSnapshot(
    key = key,
    leaseId = leaseId,
    policy = policy,
    eligible = eligible,
    requested = requested,
    desiredPlayback = desiredPlayback,
    released = released,
  )

  private val desiredPlayback: Boolean
    get() = eligible && requested && key != null && leaseId != null && !released

  private fun syncIntent() {
    val currentKey = key ?: return
    val currentLeaseId = leaseId ?: return
    coordinator.setIntent(
      currentKey,
      currentLeaseId,
      if (desiredPlayback) PlaybackSessionIntent.play else PlaybackSessionIntent.idle,
    )
  }

  private fun handle(directive: PlaybackSessionDirective) {
    when (directive.command) {
      PlaybackSessionDirectiveCommand.play -> play()
      PlaybackSessionDirectiveCommand.pause -> pause()
      PlaybackSessionDirectiveCommand.idle -> {
        requested = false
        idle()
      }
    }
  }
}
