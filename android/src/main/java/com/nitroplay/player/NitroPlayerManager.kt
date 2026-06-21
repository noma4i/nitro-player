package com.nitroplay.video.core

import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.facebook.react.bridge.LifecycleEventListener
import com.margelo.nitro.NitroModules
import com.margelo.nitro.video.HybridNitroPlayer
import com.nitroplay.video.core.utils.Threading.runOnMainThread
import com.nitroplay.video.core.utils.Threading.runOnMainThreadSync
import com.nitroplay.video.view.NitroPlayerView
import java.lang.ref.WeakReference

@OptIn(UnstableApi::class)
object NitroPlayerManager : LifecycleEventListener, ComponentCallbacks2 {
  private const val MAX_HOT_FEED_PLAYERS = 2
  private const val TRIM_MEMORY_RUNNING_LOW_LEVEL = 10
  private const val TRIM_MEMORY_COMPLETE_LEVEL = 80

  // nitroId -> weak NitroPlayerView
  private val views = mutableMapOf<Int, WeakReference<NitroPlayerView>>()
  // player -> list of nitroIds of views that are using this player
  private val players = mutableMapOf<HybridNitroPlayer, MutableList<Int>>()
  private val feedHotActivity = mutableMapOf<HybridNitroPlayer, Long>()
  private var feedHotSequence = 0L

  var audioFocusManager = AudioFocusManager()

  private var lastPlayedNitroId: Int? = null
  private var registeredContext: Context? = null

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

    registeredContext?.unregisterComponentCallbacks(this@NitroPlayerManager)
    NitroModules.applicationContext?.removeLifecycleEventListener(this@NitroPlayerManager)

    NitroModules.applicationContext?.addLifecycleEventListener(this@NitroPlayerManager)
    appContext.registerComponentCallbacks(this@NitroPlayerManager)
    registeredContext = appContext
  }

  fun maybePassPlayerToView(player: HybridNitroPlayer) {
    val views = players[player]?.mapNotNull { getNitroPlayerViewWeakReferenceByNitroId(it)?.get() } ?: return
    val latestView = views.lastOrNull() ?: return

    player.movePlayerToNitroPlayerView(latestView)
  }

  fun registerView(view: NitroPlayerView) {
    ensureRegistered(view.context)
    runOnMainThread {
      views[view.nitroId] = WeakReference<NitroPlayerView>(view)
      view.hybridPlayer?.let { touchFeedHotCandidate(it) }
    }
  }

  fun unregisterView(view: NitroPlayerView) {
    runOnMainThread {
      view.hybridPlayer?.let {
        removeViewFromPlayer(view, it)
      }

      views.remove(view.nitroId)
      rebalanceFeedHotPlayersLocked()
    }
  }

  fun addViewToPlayer(view: NitroPlayerView, player: HybridNitroPlayer) {
    runOnMainThread {
      if(!players.containsKey(player)) players[player] = mutableListOf()
      if(players[player]?.contains(view.nitroId) == true) return@runOnMainThread
      players[player]?.add(view.nitroId)
      touchFeedHotCandidate(player)
    }
  }

  fun removeViewFromPlayer(view: NitroPlayerView, player: HybridNitroPlayer) {
    runOnMainThread {
      players[player]?.remove(view.nitroId)

      if (players[player]?.isEmpty() == true) {
        players.remove(player)
        feedHotActivity.remove(player)
      } else {
        maybePassPlayerToView(player)
      }

      rebalanceFeedHotPlayersLocked()
    }
  }

  fun registerPlayer(player: HybridNitroPlayer) {
    ensureRegistered()
    runOnMainThread {
      if (!players.containsKey(player)) {
        players[player] = mutableListOf()
      }

      audioFocusManager.registerPlayer(player)
      touchFeedHotCandidate(player)
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
      feedHotActivity.remove(player)
      rebalanceFeedHotPlayersLocked()
    }
  }

  fun touchFeedHotCandidate(player: HybridNitroPlayer) {
    // lifecycle-audit:ignore(guarded-by-players-membership-check)
    runOnMainThread {
      if (!players.containsKey(player)) {
        return@runOnMainThread
      }

      if (player.isFeedProfile()) {
        feedHotSequence += 1
        feedHotActivity[player] = feedHotSequence
      } else {
        feedHotActivity.remove(player)
      }

      rebalanceFeedHotPlayersLocked()
    }
  }

  fun getPlayerByNitroId(nitroId: Int): HybridNitroPlayer? {
    return runOnMainThreadSync {
      players.keys.find { player ->
        players[player]?.contains(nitroId) == true
      }
    }
  }

  fun updateNitroPlayerViewNitroId(oldNitroId: Int, newNitroId: Int, view: NitroPlayerView) {
    runOnMainThread {
      if (oldNitroId != -1) {
        views.remove(oldNitroId)

        players.keys.forEach { player ->
          players[player]?.let { nitroIds ->
            if (nitroIds.remove(oldNitroId)) {
              nitroIds.add(newNitroId)
            }
          }
        }
      }

      views[newNitroId] = WeakReference(view)
    }
  }

  fun getNitroPlayerViewWeakReferenceByNitroId(nitroId: Int): WeakReference<NitroPlayerView>? {
    return runOnMainThreadSync { views[nitroId] }
  }

  // ------------ Lifecycle Handler ------------
  private fun onAppEnterForeground() {
    players.keys.forEach { player ->
      if (player.wasAutoPaused) {
        // play() clears wasAutoPaused only after a successful start, so a
        // throwing initializePlayer() leaves the flag set for the next resume.
        player.play()
      }
    }
  }

  private fun onAppEnterBackground() {
    players.keys.forEach { player ->
      if (!player.playInBackground && !player.playWhenInactive && player.isPlaying) {
        player.wasAutoPaused = true
        player.pause()
      }
    }
  }

  override fun onHostResume() {
    onAppEnterForeground()
  }

  override fun onHostPause() {
    onAppEnterBackground()
  }

  override fun onHostDestroy() {}

  override fun onTrimMemory(level: Int) {
    if (level < TRIM_MEMORY_RUNNING_LOW_LEVEL) {
      return
    }

    runOnMainThread {
      players.keys.toList().forEach { it.trimForResourcePressure() }
      feedHotActivity.keys.retainAll(players.keys)
      rebalanceFeedHotPlayersLocked()
    }
  }

  @Suppress("OVERRIDE_DEPRECATION")
  override fun onLowMemory() {
    onTrimMemory(TRIM_MEMORY_COMPLETE_LEVEL)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {}

  fun getAnyPlayingNitroPlayerView(): NitroPlayerView? {
    return runOnMainThreadSync {
      views.values.firstOrNull { ref ->
        ref.get()?.hybridPlayer?.isPlaying == true
      }?.get()
    }
  }

  fun setLastPlayedPlayer(player: HybridNitroPlayer) {
    val nitroIds = players[player] ?: return
    if (nitroIds.isNotEmpty()) {
      lastPlayedNitroId = nitroIds.last()
    }
  }

  fun getLastPlayedNitroPlayerView(): NitroPlayerView? {
    return runOnMainThreadSync { lastPlayedNitroId?.let { views[it]?.get() } }
  }

  private fun rebalanceFeedHotPlayersLocked() {
    val feedPlayers = players.keys.filter { it.isFeedProfile() }
    if (feedPlayers.isEmpty()) {
      feedHotActivity.clear()
      return
    }

    val feedPlayerSet = feedPlayers.toSet()
    feedHotActivity.keys.retainAll(feedPlayerSet)

    val playersToKeepHot = PlayerRetentionCoordinator.feedHotIds(
      players = feedPlayers.map {
        FeedHotPlayerSnapshot(
          id = it,
          activity = feedHotActivity[it] ?: 0L,
          retention = it.retentionSnapshot()
        )
      },
      maxHotPlayers = MAX_HOT_FEED_PLAYERS
    )

    feedPlayers
      .filterNot { playersToKeepHot.contains(it) }
      .forEach { it.trimForFeedHotPool() }
  }
}
