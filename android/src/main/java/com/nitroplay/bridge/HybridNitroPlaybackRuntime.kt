@file:kotlin.OptIn(com.nitroplay.video.support.MainThreadBlockingCall::class)

package com.margelo.nitro.video

import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.core.Promise
import com.nitroplay.video.player.NitroPlayerManager
import com.nitroplay.video.runtime.PlaybackSessionRuntime
import com.nitroplay.video.runtime.PlaybackSessionCoordinatorSnapshot
import com.nitroplay.video.streaming.HlsManifestUrl
import com.nitroplay.video.streaming.HlsProxyRuntime
import com.nitroplay.video.support.Threading.runOnMainThread
import com.nitroplay.video.support.Threading.runOnMainThreadSync
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

@DoNotStrip
class HybridNitroPlaybackRuntime : HybridNitroPlaybackRuntimeSpec() {
  private val nextExternalAudioSessionToken = AtomicLong(1L)
  private val externalAudioSessionTokens = ConcurrentHashMap.newKeySet<Long>()

  override fun debugSnapshot(): String {
    return runOnMainThreadSync {
      val snapshot = PlaybackSessionRuntime.coordinator.snapshot()
      val activeSessionKey = snapshot.activeLeaseId?.let { activeLeaseId ->
        snapshot.sessions.firstOrNull { session -> session.leaseId == activeLeaseId }?.key
      }
      val players = NitroPlayerManager.debugPlayerSnapshots(snapshot)
      JSONObject()
        .put("foreground", snapshot.foreground)
        .put("activeLeaseId", snapshot.activeLeaseId ?: JSONObject.NULL)
        .put("revision", snapshot.revision)
        .put("audioSession", JSONObject()
          .put("active", false)
          .put("foreign", externalAudioSessionTokens.isNotEmpty())
          .put("appliedProfile", JSONObject.NULL)
          .put("lastApplyError", JSONObject.NULL)
          .put("recoveryCount", 0))
        .put("prefetch", JSONObject(HlsProxyRuntime.prefetchDebugSnapshot()))
        .put("suspensions", JSONArray().apply {
          snapshot.suspensions.forEach { suspension ->
            put(JSONObject()
              .put("token", suspension.token)
              .put("reason", suspension.reason)
              .put("allowGroups", suspension.allowGroups?.let { groups -> JSONArray(groups) } ?: JSONObject.NULL))
          }
        })
        .put("sessions", JSONArray().apply {
          snapshot.sessions.forEach { session ->
            put(JSONObject()
              .put("key", session.key)
              .put("leaseId", session.leaseId)
              .put("group", session.policy.group)
              .put("priority", session.policy.priority)
              .put("resume", session.policy.resume.name)
              .put("intent", session.intent.name)
              .put("intentSequence", session.intentSequence)
              .put("effectiveState", session.effectiveState.name))
          }
        })
        .put("players", JSONArray().apply {
          players.forEach { player ->
            put(JSONObject(player)
              .put("isRingSlot", player["isRingSlot"] == true)
              .put("deniedBy", deniedBy(player, snapshot, activeSessionKey) ?: JSONObject.NULL))
          }
        })
        .toString()
    }
  }

  override fun beginExternalAudioSession(): Double {
    // Android tracks ownership only; AudioFocusEventEngine remains the platform audio-focus owner.
    val token = nextExternalAudioSessionToken.getAndIncrement()
    externalAudioSessionTokens.add(token)
    return token.toDouble()
  }

  override fun endExternalAudioSession(token: Double) {
    if (!token.isFinite() || token < 1 || token % 1.0 != 0.0 || token > Long.MAX_VALUE.toDouble()) {
      return
    }
    externalAudioSessionTokens.remove(token.toLong())
  }

  private fun deniedBy(
    player: Map<String, Any?>,
    snapshot: PlaybackSessionCoordinatorSnapshot,
    activeSessionKey: String?
  ): String? {
    if (player["intent"] != "play") {
      return "idle-intent"
    }

    val eligibility = player["eligibility"] as? Map<*, *>
    val active = eligibility?.get("active") == true
    val visible = eligibility?.get("visible") == true
    val attached = eligibility?.get("attached") == true
    val requiresView = eligibility?.get("requiresView") == true
    val failedEligibility = mutableListOf<String>()
    if (!active) {
      failedEligibility.add("active")
    }
    if (!visible) {
      failedEligibility.add("visible")
    }
    if (requiresView && !attached) {
      failedEligibility.add("attached")
    }
    if (failedEligibility.isNotEmpty()) {
      return "not-eligible(${failedEligibility.joinToString(",")})"
    }

    if (!snapshot.foreground) {
      return "background"
    }

    val group = player["group"] as? String
    val suspension = snapshot.suspensions.firstOrNull { suspension ->
      val allowGroups = suspension.allowGroups
      allowGroups == null || group == null || !allowGroups.contains(group)
    }
    if (suspension != null) {
      return "suspended-by:${suspension.reason}"
    }

    val key = player["key"] as? String
    val session = key?.let { playerKey ->
      snapshot.sessions.firstOrNull { session -> session.key == playerKey }
    }
    if (session?.leaseId != snapshot.activeLeaseId) {
      return "lost-arbitration-to:${activeSessionKey ?: "none"}"
    }

    val ringSlot = player["ringSlot"] as? Map<*, *>
    if (ringSlot?.get("awaitingSourceCommit") == true) {
      return "awaiting-source-commit"
    }

    val wantsToPlay = player["wantsToPlay"] == true
    val retentionLevel = player["retentionLevel"] as? String ?: "cold"
    val hasActiveSource = player["hasActiveSource"] == true
    if (wantsToPlay && (retentionLevel != "hot" || !hasActiveSource)) {
      return "trimmed($retentionLevel)"
    }

    return null
  }

  override fun setSuspended(key: String, suspended: Boolean, allowGroups: Array<String>?) {
    runOnMainThread {
      PlaybackSessionRuntime.setSuspended(key, suspended, allowGroups?.toList())
    }
  }

  override fun resetClientSuspensions() {
    runOnMainThread {
      PlaybackSessionRuntime.resetClientSuspensions()
    }
  }

  override fun stopAll() {
    runOnMainThread {
      PlaybackSessionRuntime.stopAll()
    }
  }

  override fun configureCache(maxBytes: Double) {
    require(maxBytes.isFinite() && maxBytes % 1.0 == 0.0 && maxBytes <= Long.MAX_VALUE.toDouble()) {
      "Nitro playback cache maxBytes must be a valid integer"
    }
    HlsProxyRuntime.configureCache(maxBytes.toLong())
  }

  override fun prefetchSource(uri: String, headers: Map<String, String>?, durationSeconds: Double?) {
    if (!HlsManifestUrl.matches(uri)) {
      HlsProxyRuntime.recordPrefetchRequest()
      HlsProxyRuntime.emitPrefetchSettled(uri)
      return
    }

    HlsProxyRuntime.requestLeadingSegmentPrefetchAsync(
      uri,
      headers,
      durationSeconds ?: HlsProxyRuntime.DEFAULT_PREFETCH_DURATION_SECONDS
    )
  }

  override fun cancelPrefetch(uri: String, headers: Map<String, String>?) {
    HlsProxyRuntime.cancelPrefetch(uri, headers)
  }

  override fun getCacheStats(): Promise<NitroCacheStats> {
    val (totalBytes, fileCount, maxBytes) = HlsProxyRuntime.cacheStats()
    return Promise.resolved(
      NitroCacheStats(
        totalBytes = totalBytes.toDouble(),
        fileCount = fileCount.toDouble(),
        maxBytes = maxBytes.toDouble()
      )
    )
  }

  override fun clearCache(): Promise<Unit> {
    HlsProxyRuntime.clearCache()
    return Promise.resolved(Unit)
  }

  override fun addOnPrefetchSettledListener(listener: (String) -> Unit): ListenerSubscription {
    return HlsProxyRuntime.addOnPrefetchSettledListener(listener)
  }

  override fun addOnOutputDeviceLostListener(listener: () -> Unit): ListenerSubscription {
    return NitroPlayerManager.addOnOutputDeviceLostListener(listener)
  }

  override fun addOnForegroundListener(listener: () -> Unit): ListenerSubscription {
    return NitroPlayerManager.addOnForegroundListener(listener)
  }
}
