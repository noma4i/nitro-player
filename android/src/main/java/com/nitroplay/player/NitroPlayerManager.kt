@file:kotlin.OptIn(com.nitroplay.video.support.MainThreadBlockingCall::class)

package com.nitroplay.video.player

import android.app.Activity
import android.app.Application
import android.content.BroadcastReceiver
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.margelo.nitro.NitroModules
import com.margelo.nitro.video.HybridNitroPlayer
import com.margelo.nitro.video.ListenerSubscription
import com.nitroplay.video.runtime.NativeSystemAudioEventEngine
import com.nitroplay.video.support.Threading.runOnMainThread
import com.nitroplay.video.support.Threading.runOnMainThreadSync
import com.nitroplay.video.support.ListenerRegistry
import com.nitroplay.video.runtime.PlaybackSessionRuntime
import com.nitroplay.video.runtime.PlaybackSessionCoordinatorSnapshot
import com.nitroplay.video.streaming.HlsProxyRuntime
import com.nitroplay.video.view.NitroPlayerView
import java.lang.ref.WeakReference
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.ConcurrentHashMap

@OptIn(UnstableApi::class)
object NitroPlayerManager : Application.ActivityLifecycleCallbacks, ComponentCallbacks2 {
  private const val TRIM_MEMORY_RUNNING_LOW_LEVEL = 10
  private const val TRIM_MEMORY_COMPLETE_LEVEL = 80

  // nitroId -> weak NitroPlayerView
  private val views = ConcurrentHashMap<Int, WeakReference<NitroPlayerView>>()
  // player -> list of nitroIds of views that are using this player
  private val players = mutableMapOf<HybridNitroPlayer, MutableList<Int>>()

  var audioFocusManager = AudioFocusManager()

  private var lastPlayedNitroId: Int? = null
  private var registeredContext: Context? = null
  // Foreground truth is process-level: started activities tracked via
  // Application.ActivityLifecycleCallbacks, never via per-ReactContext host events.
  // A ReactContext lifetime is shorter than the process (dev reload, recovery
  // recreation); a listener bound to it goes deaf after recreation and latches
  // the coordinator in background, freezing every playback election.
  private val startedActivities: MutableSet<Activity> = Collections.newSetFromMap(WeakHashMap())
  private var noisyReceiverContext: Context? = null
  private val outputDeviceLostListeners = ListenerRegistry()
  private val foregroundListeners = ListenerRegistry()
  private val systemAudioEventEngine = NativeSystemAudioEventEngine(
    muteOutput = {
      players.keys.filterNot { it.isReleased }.forEach { it.muted = true }
    },
    stopManual = PlaybackSessionRuntime::stopManual,
    stopUnbound = {
      players.keys
        .filter { !it.hasPlaybackBinding && !it.isReleased && it.wantsToPlay }
        .toList()
        .forEach { it.pause() }
    },
    notifyOutputDeviceLost = {
      outputDeviceLostListeners.emit<() -> Unit>("onOutputDeviceLost") { it() }
    },
  )
  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action != AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
        return
      }

      runOnMainThread {
        systemAudioEventEngine.oldOutputDeviceBecameUnavailable()
      }
    }
  }

  init {
    ensureRegistered()
  }

  fun ensureRegistered() {
    NitroModules.applicationContext?.let { ensureRegistered(it) }
  }

  fun ensureRegistered(context: Context) {
    val appContext = context.applicationContext
    if (registeredContext === appContext) {
      return
    }

    noisyReceiverContext?.unregisterReceiver(noisyReceiver)
    noisyReceiverContext = null
    registeredContext?.unregisterComponentCallbacks(this@NitroPlayerManager)
    (registeredContext as? Application)?.unregisterActivityLifecycleCallbacks(this@NitroPlayerManager)

    (appContext as? Application)?.registerActivityLifecycleCallbacks(this@NitroPlayerManager)
    appContext.registerComponentCallbacks(this@NitroPlayerManager)
    registerNoisyReceiver(appContext)
    registeredContext = appContext
    // Registration happens after the hosting activity already delivered onStart;
    // seed it so the first onActivityStopped still flips the process to background.
    NitroModules.applicationContext?.currentActivity?.let { startedActivities.add(it) }
  }

  fun addOnOutputDeviceLostListener(listener: () -> Unit): ListenerSubscription {
    return outputDeviceLostListeners.add("onOutputDeviceLost", listener)
  }

  fun addOnForegroundListener(listener: () -> Unit): ListenerSubscription {
    return foregroundListeners.add("onForeground", listener)
  }

  fun maybePassPlayerToView(player: HybridNitroPlayer) {
    pruneStaleViewsLocked()
    val views = players[player]?.mapNotNull { getNitroPlayerViewWeakReferenceByNitroId(it)?.get() } ?: return
    val latestView = views.lastOrNull() ?: return

    player.movePlayerToNitroPlayerView(latestView)
  }

  fun registerView(view: NitroPlayerView) {
    ensureRegistered(view.context)
    runOnMainThread {
      pruneStaleViewsLocked()
      views[view.nitroId] = WeakReference<NitroPlayerView>(view)
    }
  }

  fun unregisterView(view: NitroPlayerView) {
    runOnMainThread {
      view.hybridPlayer?.let {
        removeViewFromPlayer(view, it)
      }

      views.remove(view.nitroId)
    }
  }

  fun addViewToPlayer(view: NitroPlayerView, player: HybridNitroPlayer) {
    runOnMainThread {
      if(!players.containsKey(player)) players[player] = mutableListOf()
      if(players[player]?.contains(view.nitroId) == true) return@runOnMainThread
      players[player]?.add(view.nitroId)
    }
  }

  fun removeViewFromPlayer(view: NitroPlayerView, player: HybridNitroPlayer) {
    // lifecycle-audit:ignore(view-link-teardown-touches-view-refs-only)
    runOnMainThread {
      player.detachPlayerFromNitroPlayerView(view)
      players[player]?.remove(view.nitroId)

      if (players[player]?.isEmpty() == true) {
        players.remove(player)
      } else {
        maybePassPlayerToView(player)
      }
    }
  }

  fun registerPlayer(player: HybridNitroPlayer) {
    ensureRegistered()
    runOnMainThread {
      if (!players.containsKey(player)) {
        players[player] = mutableListOf()
      }

      audioFocusManager.registerPlayer(player)
    }
  }

  fun unregisterPlayer(player: HybridNitroPlayer) {
    runOnMainThread {
      audioFocusManager.unregisterPlayer(player)

      players[player]?.toList()?.forEach { nitroId ->
        views[nitroId]?.get()?.let { view ->
          view.hybridPlayer = null
        }
      }

      players.remove(player)
    }
  }

  fun debugPlayerSnapshots(
    coordinatorSnapshot: PlaybackSessionCoordinatorSnapshot
  ): List<Map<String, Any?>> {
    return runOnMainThreadSync {
      players.keys
        .filterNot { player -> player.isReleased }
        .map { player -> player.diagnosticsSnapshot(coordinatorSnapshot) }
    }
  }

  fun updateNitroPlayerViewNitroId(oldNitroId: Int, newNitroId: Int, view: NitroPlayerView) {
    if (oldNitroId != -1) {
      views.remove(oldNitroId)
    }
    views[newNitroId] = WeakReference(view)

    if (oldNitroId == -1) return
    runOnMainThread {
      players.keys.forEach { player ->
        players[player]?.let { nitroIds ->
          if (nitroIds.remove(oldNitroId)) {
            nitroIds.add(newNitroId)
          }
        }
      }
    }
  }

  fun getNitroPlayerViewWeakReferenceByNitroId(nitroId: Int): WeakReference<NitroPlayerView>? {
    return views[nitroId]
  }

  // ------------ Lifecycle Handler ------------
  private fun onAppEnterForeground() {
    players.keys.forEach { player ->
      if (player.hasPlaybackBinding) {
        return@forEach
      }
      if (PlayerAppStatePolicy.shouldResumeWhenEnteringForeground(player.appStateSnapshot())) {
        // play() clears wasAutoPaused only after a successful start, so a
        // throwing initializePlayer() leaves the flag set for the next resume.
        player.play()
      } else {
        player.wasAutoPaused = false
      }
    }
  }

  private fun onAppEnterBackground() {
    players.keys.forEach { player ->
      if (player.hasPlaybackBinding) {
        return@forEach
      }
      if (PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(player.appStateSnapshot())) {
        player.wasAutoPaused = true
        player.lifecyclePause()
      }
    }
  }

  override fun onActivityStarted(activity: Activity) {
    val wasBackground = startedActivities.isEmpty()
    startedActivities.add(activity)
    if (!wasBackground) {
      return
    }

    players.keys.forEach { player ->
      player.resetRecoveryBudgetsForNewLifecycleEpoch()
    }
    audioFocusManager.resolveStaleInterruption()
    foregroundListeners.emit<() -> Unit>("onForeground") { it() }
    recoverPlaybackTransport()
    PlaybackSessionRuntime.setForeground(true)
    onAppEnterForeground()
  }

  override fun onActivityStopped(activity: Activity) {
    if (!startedActivities.remove(activity) || startedActivities.isNotEmpty()) {
      return
    }

    HlsProxyRuntime.markNeedsHealthCheck()
    PlaybackSessionRuntime.setForeground(false)
    onAppEnterBackground()
  }

  /**
   * Foreground recovery, ordered by dependency: the transport must be trusted again before any
   * route is re-resolved, because a route resolved against an unhealthy transport silently
   * bypasses the proxy.
   */
  private fun recoverPlaybackTransport() {
    HlsProxyRuntime.recoverTransport {
      runOnMainThread {
        players.keys.forEach { player ->
          player.refreshPlaybackRouteIfStale()
          player.reassertPlaybackIntentAfterForeground()
        }
      }
    }
  }

  override fun onActivityDestroyed(activity: Activity) {
    startedActivities.remove(activity)
    if (!activity.isFinishing || startedActivities.isNotEmpty()) {
      return
    }

    runOnMainThread {
      PlaybackSessionRuntime.resetClientSuspensions()
    }
  }

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit

  override fun onActivityResumed(activity: Activity) = Unit

  override fun onActivityPaused(activity: Activity) = Unit

  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit

  override fun onTrimMemory(level: Int) {
    if (level < TRIM_MEMORY_RUNNING_LOW_LEVEL) {
      return
    }

    runOnMainThread {
      players.keys.toList().forEach { it.trimForResourcePressure() }
    }
  }

  @Suppress("OVERRIDE_DEPRECATION")
  override fun onLowMemory() {
    onTrimMemory(TRIM_MEMORY_COMPLETE_LEVEL)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {}

  fun setLastPlayedPlayer(player: HybridNitroPlayer) {
    val nitroIds = players[player] ?: return
    if (nitroIds.isNotEmpty()) {
      lastPlayedNitroId = nitroIds.last()
    }
  }

  private fun pruneStaleViewsLocked() {
    val staleNitroIds = views.filterValues { it.get() == null }.keys
    if (staleNitroIds.isEmpty()) {
      return
    }
    staleNitroIds.forEach(views::remove)
    if (lastPlayedNitroId in staleNitroIds) {
      lastPlayedNitroId = null
    }
  }

  private fun registerNoisyReceiver(appContext: Context) {
    val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      appContext.registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerNoisyReceiverLegacy(appContext, filter)
    }
    noisyReceiverContext = appContext
  }

  @Suppress("DEPRECATION")
  private fun registerNoisyReceiverLegacy(appContext: Context, filter: IntentFilter) {
    appContext.registerReceiver(noisyReceiver, filter)
  }

}
