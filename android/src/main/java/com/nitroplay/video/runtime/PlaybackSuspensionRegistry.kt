package com.nitroplay.video.runtime

data class PlaybackSuspensionRegistrySnapshotEntry(
  val key: String,
  val allowGroups: List<String>?,
)

data class PlaybackSuspensionRegistrySnapshot(
  val entries: List<PlaybackSuspensionRegistrySnapshotEntry>,
)

class PlaybackSuspensionRegistry(private val acquire: (String, List<String>?) -> () -> Unit) {
  private data class Entry(
    val release: () -> Unit,
    val allowGroups: List<String>?,
  )

  private val entries: MutableMap<String, Entry> = mutableMapOf()

  fun set(key: String, active: Boolean, allowGroups: List<String>? = null) {
    require(key.isNotBlank())

    val normalizedAllowGroups = normalizeAllowGroups(allowGroups)
    if (!active) {
      val current = entries.remove(key) ?: return
      current.release()
      return
    }

    val current = entries[key]
    if (current != null && current.allowGroups == normalizedAllowGroups) {
      return
    }

    if (current != null) {
      val replacementRelease = acquire(key, normalizedAllowGroups)
      entries[key] = Entry(release = replacementRelease, allowGroups = normalizedAllowGroups)
      current.release()
      return
    }

    entries[key] = Entry(release = acquire(key, normalizedAllowGroups), allowGroups = normalizedAllowGroups)
  }

  fun clear() {
    if (entries.isEmpty()) {
      return
    }

    val releases = entries
      .toList()
      .sortedBy { it.first }
      .map { it.second.release }
    entries.clear()
    releases.forEach { it() }
  }

  fun clear(keyPrefix: String) {
    val matchingEntries = entries
      .filterKeys { it.startsWith(keyPrefix) }
      .toList()
      .sortedBy { it.first }
    if (matchingEntries.isEmpty()) {
      return
    }

    matchingEntries.forEach { entries.remove(it.first) }
    matchingEntries.forEach { it.second.release() }
  }

  fun snapshot(): PlaybackSuspensionRegistrySnapshot = PlaybackSuspensionRegistrySnapshot(
    entries = entries
      .toList()
      .sortedBy { it.first }
      .map { PlaybackSuspensionRegistrySnapshotEntry(it.first, it.second.allowGroups) },
  )

  private fun normalizeAllowGroups(rawAllowGroups: List<String>?): List<String>? {
    rawAllowGroups ?: return null
    val trimmed = rawAllowGroups.map { it.trim() }
    require(trimmed.none { it.isBlank() })
    return trimmed.toSet().sorted()
  }
}
