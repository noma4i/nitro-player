import Foundation

struct PlaybackSuspensionRegistrySnapshotEntry {
  let key: String
  let allowGroups: [String]?
}

struct PlaybackSuspensionRegistrySnapshot {
  let entries: [PlaybackSuspensionRegistrySnapshotEntry]
}

final class PlaybackSuspensionRegistry {
  typealias Acquire = (String, [String]?) -> () -> Void

  private struct Entry {
    let release: () -> Void
    let allowGroups: [String]?
  }

  private let acquire: Acquire
  private var entries: [String: Entry] = [:]

  init(acquire: @escaping Acquire) {
    self.acquire = acquire
  }

  func set(key: String, active: Bool, allowGroups: [String]? = nil) {
    precondition(!key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

    let normalizedGroups = normalize(allowGroups)

    if active {
      if let current = entries[key] {
        if current.allowGroups == normalizedGroups {
          return
        }

        let replacementRelease = acquire(key, normalizedGroups)
        entries[key] = Entry(release: replacementRelease, allowGroups: normalizedGroups)
        current.release()
        return
      }

      entries[key] = Entry(
        release: acquire(key, normalizedGroups),
        allowGroups: normalizedGroups
      )
      return
    }

    guard let current = entries.removeValue(forKey: key) else {
      return
    }
    current.release()
  }

  func clear() {
    guard !entries.isEmpty else {
      return
    }

    let releases = entries
      .sorted { $0.key < $1.key }
      .map { $0.value.release }
    entries.removeAll()
    releases.forEach { $0() }
  }

  func clear(keyPrefix: String) {
    let matchingEntries = entries
      .filter { $0.key.hasPrefix(keyPrefix) }
      .sorted { $0.key < $1.key }
    guard !matchingEntries.isEmpty else {
      return
    }

    matchingEntries.forEach { entries.removeValue(forKey: $0.key) }
    matchingEntries.forEach { $0.value.release() }
  }

  func snapshot() -> PlaybackSuspensionRegistrySnapshot {
    PlaybackSuspensionRegistrySnapshot(
      entries: entries
        .sorted { $0.key < $1.key }
        .map { PlaybackSuspensionRegistrySnapshotEntry(key: $0.key, allowGroups: $0.value.allowGroups) }
    )
  }

  private func normalize(_ rawAllowGroups: [String]?) -> [String]? {
    guard let rawAllowGroups else {
      return nil
    }

    let trimmed = rawAllowGroups.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    precondition(trimmed.allSatisfy { !$0.isEmpty })
    return Array(Set(trimmed)).sorted()
  }
}
