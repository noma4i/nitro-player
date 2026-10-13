package com.nitroplay.video.runtime

import java.util.ArrayDeque

enum class PlaybackSessionResumeMode {
  automatic,
  manual,
}

enum class PlaybackSessionIntent {
  play,
  idle,
}

enum class PlaybackSessionEffectiveState {
  playing,
  paused,
}

enum class PlaybackSessionDirectiveCommand {
  play,
  pause,
  idle,
}

data class PlaybackSessionPolicy(
  val group: String,
  val priority: Int,
  val resume: PlaybackSessionResumeMode,
)

data class PlaybackSessionDirective(
  val command: PlaybackSessionDirectiveCommand,
  val leaseId: Long,
)

data class PlaybackSessionSnapshot(
  val key: String,
  val leaseId: Long,
  val policy: PlaybackSessionPolicy,
  val intent: PlaybackSessionIntent,
  val intentSequence: Long,
  val effectiveState: PlaybackSessionEffectiveState,
)

data class PlaybackSessionSuspensionSnapshot(
  val token: Long,
  val reason: String,
  val allowGroups: List<String>?,
)

data class PlaybackSessionCoordinatorSnapshot(
  val foreground: Boolean,
  val activeLeaseId: Long?,
  val suspensions: List<PlaybackSessionSuspensionSnapshot>,
  val sessions: List<PlaybackSessionSnapshot>,
  val revision: Long,
)

class PlaybackSessionSuspensionHandle internal constructor(
  private val releaseAction: () -> Unit,
) {
  private var released = false

  fun release() {
    if (released) {
      return
    }

    released = true
    releaseAction()
  }
}

class PlaybackSessionCoordinator {
  private data class Session(
    val key: String,
    val leaseId: Long,
    val policy: PlaybackSessionPolicy,
    val onDirective: (PlaybackSessionDirective) -> Unit,
    var intent: PlaybackSessionIntent = PlaybackSessionIntent.idle,
    var intentSequence: Long = 0,
    var effectiveState: PlaybackSessionEffectiveState = PlaybackSessionEffectiveState.paused,
  )

  private data class Suspension(
    val token: Long,
    val reason: String,
    val allowGroups: Set<String>?,
  )

  private data class QueuedDirective(
    val handler: (PlaybackSessionDirective) -> Unit,
    val directive: PlaybackSessionDirective,
    val shouldDeliver: () -> Boolean,
  )

  private var foreground = true
  private var activeLeaseId: Long? = null
  private val sessions = mutableMapOf<Long, Session>()
  private val suspensions = mutableMapOf<Long, Suspension>()
  private var nextLeaseId = 1L
  private var nextSuspensionToken = 1L
  private var nextIntentSequence = 1L
  private var revision = 0L
  private val queuedDirectives = ArrayDeque<QueuedDirective>()
  private var isDraining = false

  fun register(
    key: String,
    policy: PlaybackSessionPolicy,
    onDirective: (PlaybackSessionDirective) -> Unit,
  ): Long {
    val leaseId = nextLeaseId++
    sessions[leaseId] = Session(key, leaseId, policy, onDirective)
    revision += 1
    return leaseId
  }

  fun unregister(key: String, leaseId: Long) {
    val session = sessions[leaseId] ?: return
    if (session.key != key) {
      return
    }

    sessions.remove(leaseId)
    revision += 1
    if (activeLeaseId == leaseId) {
      activeLeaseId = null
      enqueue(session, PlaybackSessionDirectiveCommand.pause, requiresCurrentState = false)
    }
    resolve(manualLossBecomesIdle = true)
    drainDirectives()
  }

  fun setIntent(key: String, leaseId: Long, intent: PlaybackSessionIntent) {
    val session = sessions[leaseId] ?: return
    if (session.key != key || session.intent == intent) {
      return
    }

    session.intent = intent
    if (intent == PlaybackSessionIntent.play) {
      session.intentSequence = nextIntentSequence++
    }
    revision += 1
    resolve(manualLossBecomesIdle = intent == PlaybackSessionIntent.play)
    drainDirectives()
  }

  fun setForeground(foreground: Boolean) {
    if (this.foreground == foreground) {
      return
    }

    this.foreground = foreground
    revision += 1
    // Backgrounding pauses without dropping manual intent so foreground resolve resumes the session.
    resolve(manualLossBecomesIdle = false)
    drainDirectives()
  }

  fun suspend(reason: String, allowGroups: Set<String>? = null): PlaybackSessionSuspensionHandle {
    val token = nextSuspensionToken++
    suspensions[token] = Suspension(token, reason, allowGroups)
    revision += 1
    resolve(manualLossBecomesIdle = true)
    drainDirectives()
    return PlaybackSessionSuspensionHandle { releaseSuspension(token) }
  }

  fun stopAll() {
    val affected = sessions.values.filter { it.intent == PlaybackSessionIntent.play }
    if (affected.isEmpty()) {
      return
    }

    val active = activeLeaseId?.let { sessions[it] }
    affected.forEach {
      it.intent = PlaybackSessionIntent.idle
      it.effectiveState = PlaybackSessionEffectiveState.paused
    }
    activeLeaseId = null
    revision += 1
    if (active != null) {
      enqueue(active, PlaybackSessionDirectiveCommand.pause)
      enqueue(active, PlaybackSessionDirectiveCommand.idle)
    }
    affected.sortedBy { it.leaseId }.filter { it.leaseId != active?.leaseId }.forEach {
      enqueue(it, PlaybackSessionDirectiveCommand.idle)
    }
    drainDirectives()
  }

  fun stopManual() {
    val affected = sessions.values.filter {
      it.policy.resume == PlaybackSessionResumeMode.manual && it.intent == PlaybackSessionIntent.play
    }
    if (affected.isEmpty()) {
      return
    }

    val active = activeLeaseId?.let { sessions[it] }?.takeIf {
      it.policy.resume == PlaybackSessionResumeMode.manual
    }
    affected.forEach {
      it.intent = PlaybackSessionIntent.idle
      it.effectiveState = PlaybackSessionEffectiveState.paused
    }
    if (active != null) {
      activeLeaseId = null
    }
    revision += 1
    if (active != null) {
      enqueue(active, PlaybackSessionDirectiveCommand.pause)
      enqueue(active, PlaybackSessionDirectiveCommand.idle)
    }
    affected.sortedBy { it.leaseId }.filter { it.leaseId != active?.leaseId }.forEach {
      enqueue(it, PlaybackSessionDirectiveCommand.idle)
    }
    resolve(manualLossBecomesIdle = false)
    drainDirectives()
  }

  fun isActive(key: String, leaseId: Long): Boolean =
    activeLeaseId == leaseId && sessions[leaseId]?.key == key

  fun snapshot(): PlaybackSessionCoordinatorSnapshot = PlaybackSessionCoordinatorSnapshot(
    foreground = foreground,
    activeLeaseId = activeLeaseId,
    suspensions = suspensions.values.sortedBy { it.token }.map {
      PlaybackSessionSuspensionSnapshot(it.token, it.reason, it.allowGroups?.sorted())
    },
    sessions = sessions.values.sortedBy { it.leaseId }.map {
      PlaybackSessionSnapshot(it.key, it.leaseId, it.policy, it.intent, it.intentSequence, it.effectiveState)
    },
    revision = revision,
  )

  private fun releaseSuspension(token: Long) {
    if (suspensions.remove(token) == null) {
      return
    }

    revision += 1
    resolve(manualLossBecomesIdle = true)
    drainDirectives()
  }

  private fun resolve(manualLossBecomesIdle: Boolean) {
    val winner = winningSession()
    if (winner?.leaseId == activeLeaseId) {
      return
    }

    activeLeaseId?.let { leaseId ->
      sessions[leaseId]?.let { active ->
        active.effectiveState = PlaybackSessionEffectiveState.paused
        activeLeaseId = null
        enqueue(active, PlaybackSessionDirectiveCommand.pause)
        if (active.policy.resume == PlaybackSessionResumeMode.manual && manualLossBecomesIdle) {
          active.intent = PlaybackSessionIntent.idle
          enqueue(active, PlaybackSessionDirectiveCommand.idle)
        }
      }
    }

    val next = winningSession() ?: return
    next.effectiveState = PlaybackSessionEffectiveState.playing
    activeLeaseId = next.leaseId
    enqueue(next, PlaybackSessionDirectiveCommand.play)
  }

  private fun winningSession(): Session? = sessions.values
    .filter(::isEligible)
    .sortedWith(
      compareByDescending<Session> { it.policy.priority }
        .thenByDescending { it.intentSequence }
        .thenBy { it.key }
        .thenBy { it.leaseId },
    )
    .firstOrNull()

  private fun isEligible(session: Session): Boolean {
    if (!foreground || session.intent != PlaybackSessionIntent.play) {
      return false
    }

    return suspensions.values.all { suspension ->
      suspension.allowGroups?.contains(session.policy.group) == true
    }
  }

  private fun enqueue(
    session: Session,
    command: PlaybackSessionDirectiveCommand,
    requiresCurrentState: Boolean = true,
  ) {
    queuedDirectives.addLast(
      QueuedDirective(session.onDirective, PlaybackSessionDirective(command, session.leaseId)) {
        if (!requiresCurrentState) {
          true
        } else {
          val current = sessions[session.leaseId] ?: return@QueuedDirective false
          when (command) {
            PlaybackSessionDirectiveCommand.play -> activeLeaseId == session.leaseId && current.effectiveState == PlaybackSessionEffectiveState.playing
            PlaybackSessionDirectiveCommand.pause -> current.effectiveState == PlaybackSessionEffectiveState.paused
            PlaybackSessionDirectiveCommand.idle -> current.intent == PlaybackSessionIntent.idle
          }
        }
      },
    )
  }

  private fun drainDirectives() {
    if (isDraining) {
      return
    }

    isDraining = true
    while (queuedDirectives.isNotEmpty()) {
      val queued = queuedDirectives.removeFirst()
      if (!queued.shouldDeliver()) {
        continue
      }
      try {
        queued.handler(queued.directive)
      } catch (_: Exception) {
      }
    }
    isDraining = false
  }
}
