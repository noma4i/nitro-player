package com.nitroplay.video.core

import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.facebook.react.bridge.LifecycleEventListener
import com.margelo.nitro.NitroModules
import com.margelo.nitro.video.HybridNitroPlayer
import com.margelo.nitro.video.MixAudioMode
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
  
  // Keep track of players that were paused due to PiP so that they can be resumed later
  private val playersPausedForPip = mutableSetOf<HybridNitroPlayer>()
  
  private var currentPipNitroPlayerView: WeakReference<NitroPlayerView>? = null

  var audioFocusManager = AudioFocusManager()

  private var lastPlayedNitroId: Int? = null

  init {
    NitroModules.applicationContext?.apply {
      addLifecycleEventListener(this@NitroPlayerManager)
    }
  }

  fun requestPictureInPicture(videoView: NitroPlayerView): Boolean {
    Log.d(TAG, "PiP requested for video nitroId: ${videoView.nitroId}")
    
    if (videoView.isInPictureInPicture) {
      Log.d(TAG, "Video nitroId: ${videoView.nitroId} is already in PiP")
      return true
    }
    
    // Exit PiP from current video if there is one
    currentPipNitroPlayerView?.get()?.let { currentPipVideo ->
      if (currentPipVideo != videoView && currentPipVideo.isInPictureInPicture) {
        Log.d(TAG, "Forcing exit PiP for video nitroId: ${currentPipVideo.nitroId} to make room for nitroId: ${videoView.nitroId}")
        currentPipVideo.forceExitPictureInPicture()
      }
    }
    
    // Ensure the player that belongs to this view is attached back to this view
    videoView.hybridPlayer?.movePlayerToNitroPlayerView(videoView)
    
    // Pause every other player that might be playing in the background so that only the PiP video plays
    pauseOtherPlayers(videoView)
    
    // Set this video as the designated PiP video BEFORE entering PiP mode
    // This ensures PiP callbacks know which video should respond
    currentPipNitroPlayerView = WeakReference(videoView)
    Log.d(TAG, "Designated video nitroId: ${videoView.nitroId} as the PiP video")
    
    val success = videoView.internalEnterPictureInPicture()
    Log.d(TAG, "PiP enter result for video nitroId: ${videoView.nitroId} = $success")
    
    if (!success) {
      // If we failed to enter PiP, resume any players we just paused
      resumePlayersPausedForPip()
      currentPipNitroPlayerView = null
      Log.w(TAG, "Failed to enter PiP, clearing designated PiP video")
    }
    
    return success
  }
  
  fun notifyPictureInPictureExited(videoView: NitroPlayerView) {
    Log.d(TAG, "PiP exit notification for video nitroId: ${videoView.nitroId}")
    currentPipNitroPlayerView?.get()?.let { currentPipVideo ->
      if (currentPipVideo == videoView) {
        Log.d(TAG, "Clearing PiP reference for video nitroId: ${videoView.nitroId}")
        currentPipNitroPlayerView = null
        // Resume any players that were paused when PiP was entered
        resumePlayersPausedForPip()
      }
    }
  }
  
  fun getCurrentPictureInPictureVideo(): NitroPlayerView? {
    return currentPipNitroPlayerView?.get()
  }
  
  fun setCurrentPictureInPictureVideo(videoView: NitroPlayerView) {
    Log.d(TAG, "Setting current PiP video to nitroId: ${videoView.nitroId}")
    currentPipNitroPlayerView = WeakReference(videoView)
  }
  
  fun isAnyVideoInPictureInPicture(): Boolean {
    return currentPipNitroPlayerView?.get()?.isInPictureInPicture == true
  }
  
  fun forceExitAllPictureInPicture() {
    currentPipNitroPlayerView?.get()?.let { currentPipVideo ->
      if (currentPipVideo.isInPictureInPicture) {
        currentPipVideo.forceExitPictureInPicture()
      }
    }
    currentPipNitroPlayerView = null
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

      // Clean up PiP reference if this view was in PiP
      currentPipNitroPlayerView?.get()?.let { currentPipVideo ->
        if (currentPipVideo == view) {
          currentPipNitroPlayerView = null
        }
      }

      views.remove(view.nitroId)
      rebalanceFeedHotPlayersLocked()
    }
  }

  fun addViewToPlayer(view: NitroPlayerView, player: HybridNitroPlayer) {
    runOnMainThread {
      // Add player to list if it doesn't exist (should not happen)
      if(!players.containsKey(player)) players[player] = mutableListOf()

      // Check if view is already added to player
      if(players[player]?.contains(view.nitroId) == true) return@runOnMainThread

      // Add view to player
      players[player]?.add(view.nitroId)
      touchFeedHotCandidate(player)
    }
  }

  fun removeViewFromPlayer(view: NitroPlayerView, player: HybridNitroPlayer) {
    runOnMainThread {
      players[player]?.remove(view.nitroId)

      // If this was the last view using this player, clean up
      if (players[player]?.isEmpty() == true) {
        players.remove(player)
        feedHotActivity.remove(player)
      } else {
        // If there are other views using this player, move to the latest one
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

      // Remove player from any views that were using it
      players[player]?.forEach { nitroId ->
        views[nitroId]?.get()?.let { view ->
          view.hybridPlayer = null
        }
      }

      players.remove(player)
      feedHotActivity.remove(player)
      playersPausedForPip.remove(player)
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
      // Remove old mapping
      if (oldNitroId != -1) {
        views.remove(oldNitroId)

        // Update player mappings
        players.keys.forEach { player ->
          players[player]?.let { nitroIds ->
            if (nitroIds.remove(oldNitroId)) {
              nitroIds.add(newNitroId)
            }
          }
        }
      }

      // Add new mapping
      views[newNitroId] = WeakReference(view)
    }
  }

  fun getNitroPlayerViewWeakReferenceByNitroId(nitroId: Int): WeakReference<NitroPlayerView>? {
    return views[nitroId]
  }

  // ------------ Lifecycle Handler ------------
  private fun onAppEnterForeground() {
    currentPipNitroPlayerView?.get()?.let { pipView ->
      if (pipView.isInPictureInPicture) {
        pipView.eventsEmitter?.willExitPictureInPicture()
        pipView.isInPictureInPicture = false
        notifyPictureInPictureExited(pipView)
      }
    }

    players.keys.forEach { player ->
      if (player.wasAutoPaused) {
        player.play()
      }
    }
  }

  private fun onAppEnterBackground() {
    val autoEnterPipView = getLastPlayedNitroPlayerView()
      ?.takeIf { view ->
        view.autoEnterPictureInPicture &&
          view.hybridPlayer?.isPlaying == true &&
          view.canEnterPictureInPicture()
      }

    if (autoEnterPipView != null && requestPictureInPicture(autoEnterPipView)) {
      return
    }

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

  override fun onHostDestroy() {
    forceExitAllPictureInPicture()
  }

  fun pauseOtherPlayers(pipNitroPlayerView: NitroPlayerView) {
    val pipPlayer = pipNitroPlayerView.hybridPlayer
    playersPausedForPip.clear()

    players.keys.forEach { player ->
      // Skip the player that is used for the PiP view
      if (player == pipPlayer) return@forEach

      // Pause only if it is currently playing
      if (player.isPlaying && player.mixAudioMode != MixAudioMode.MIXWITHOTHERS) {
        player.pause()
        playersPausedForPip.add(player)
        Log.v(TAG, "Paused player for PiP (nitroIds: ${players[player]})")
      }
    }
  }

  private fun resumePlayersPausedForPip() {
    playersPausedForPip.forEach { player ->
      try {
        maybePassPlayerToView(player)
        if (!player.isPlaying) {
          player.play()
          Log.v(TAG, "Resumed player after PiP exit (nitroIds: ${players[player]})")
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to resume player after PiP", e)
      }
    }
    playersPausedForPip.clear()
  }

  fun getAnyPlayingNitroPlayerView(): NitroPlayerView? {
    return views.values.firstOrNull { ref ->
      ref.get()?.hybridPlayer?.isPlaying == true
    }?.get()
  }

  fun setLastPlayedPlayer(player: HybridNitroPlayer) {
    // Resolve to the latest view using this player (usually the last one in the list)
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
