package com.nitroplay.video.runtime

object PlaybackSessionRuntime {
  private const val CLIENT_SUSPENSION_KEY_PREFIX = "nitro-suspension:"
  val coordinator = PlaybackSessionCoordinator()
  private val playbackSuspensionRegistry = PlaybackSuspensionRegistry { key, allowGroups ->
    {
      coordinator.suspend(key, allowGroups?.toSet()).release()
    }
  }

  fun setForeground(foreground: Boolean) {
    coordinator.setForeground(foreground)
  }

  fun setSuspended(key: String, suspended: Boolean, allowGroups: List<String>? = null) {
    playbackSuspensionRegistry.set(key, suspended, allowGroups)
  }

  fun resetClientSuspensions() {
    playbackSuspensionRegistry.clear(CLIENT_SUSPENSION_KEY_PREFIX)
  }

  fun stopAll() {
    coordinator.stopAll()
  }

  fun stopManual() {
    coordinator.stopManual()
  }
}
