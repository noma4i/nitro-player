package com.nitroplay.video.core

import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.facebook.react.bridge.LifecycleEventListener
import com.margelo.nitro.NitroModules
import com.margelo.nitro.video.HybridNitroPlayer
import com.nitroplay.video.core.utils.Threading.runOnMainThread
import com.nitroplay.video.view.NitroPlayerView
import java.lang.ref.WeakReference

@OptIn(UnstableApi::class)
object NitroPlayerManager : LifecycleEventListener {
  private const val TAG = "NitroPlayerManager"
  private const val MAX_HOT_FEED_PLAYERS = 2

  // nitroId -> weak NitroPlayerView
  private val views = mutableMapOf<Int, WeakReference<NitroPlayerView>>()
  // player -> list of nitroIds of views that are using this player
  private val players = mutableMapOf<HybridNitroPlayer, MutableList<Int>>()
  private val feedHotActivity = mutableMapOf<HybridNitroPlayer, Long>()
  private var feedHotSequence = 0L

  var audioFocusManager = AudioFocusManager()

  private var lastPlayedNitroId: Int? = null

  init {
    NitroModules.applicationContext?.apply {
      addLifecycleEventListener(this@NitroPlayerManager)
    }
  }

  fun maybePassPlayerToView(player: HybridNitroPlayer) {
    val views = players[player]?.mapNotNull { getNitroPlayerViewWeakReferenceByNitroId(it)?.get() } ?: return
    val latestView = views.lastOrNull() ?: return

    player.movePlayerToNitroPlayerView(latestView)
  }

  fun registerView(view: NitroPlayerView) {
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

      players[player]?.forEach { nitroId ->
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
    return players.keys.find { player ->
      players[player]?.contains(nitroId) == true
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
    return views[nitroId]
  }

  // ------------ Lifecycle Handler ------------
  private fun onAppEnterForeground() {
    players.keys.forEach { player ->
      if (player.wasAutoPaused) {
        player.play()
      }
    }
  }

  private fun onAppEnterBackground() {
    players.keys.forEach { player ->
      if (!player.playInBackground && player.isPlaying) {
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

  fun getAnyPlayingNitroPlayerView(): NitroPlayerView? {
    return views.values.firstOrNull { ref ->
      ref.get()?.hybridPlayer?.isPlaying == true
    }?.get()
  }

  fun setLastPlayedPlayer(player: HybridNitroPlayer) {
    val nitroIds = players[player] ?: return
    if (nitroIds.isNotEmpty()) {
      lastPlayedNitroId = nitroIds.last()
    }
  }

  fun getLastPlayedNitroPlayerView(): NitroPlayerView? {
    return lastPlayedNitroId?.let { views[it]?.get() }
  }

  private fun rebalanceFeedHotPlayersLocked() {
    val feedPlayers = players.keys.filter { it.isFeedProfile() }
    if (feedPlayers.isEmpty()) {
      feedHotActivity.clear()
      return
    }

    val feedPlayerSet = feedPlayers.toSet()
    feedHotActivity.keys.retainAll(feedPlayerSet)

    val pinnedPlayers = feedPlayers
      .filter { it.shouldStayHotInFeedPool() }
      .sortedByDescending { feedHotActivity[it] ?: 0L }

    val relaxedPlayers = feedPlayers
      .filterNot { pinnedPlayers.contains(it) }
      .sortedByDescending { feedHotActivity[it] ?: 0L }

    val playersToKeepHot = linkedSetOf<HybridNitroPlayer>()
    playersToKeepHot.addAll(pinnedPlayers)

    val extraHotSlots = (MAX_HOT_FEED_PLAYERS - playersToKeepHot.size).coerceAtLeast(0)
    relaxedPlayers.take(extraHotSlots).forEach { playersToKeepHot.add(it) }

    feedPlayers
      .filterNot { playersToKeepHot.contains(it) }
      .forEach { it.trimForFeedHotPool() }
  }
}
