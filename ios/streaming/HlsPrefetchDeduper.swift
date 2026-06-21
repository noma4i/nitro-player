import Foundation

final class HlsPrefetchDeduper {
  private let window: TimeInterval
  private let maxEntries: Int
  private let now: () -> Date
  private let queue = DispatchQueue(label: "com.nitroplay.hls.prefetch-deduper")
  private var timestamps: [String: Date] = [:]
  private var insertionOrder: [String] = []

  init(window: TimeInterval, maxEntries: Int, now: @escaping () -> Date = Date.init) {
    self.window = window
    self.maxEntries = maxEntries
    self.now = now
  }

  var size: Int {
    queue.sync { timestamps.count }
  }

  func shouldPrefetch(key: String) -> Bool {
    queue.sync {
      let current = now()
      if let last = timestamps[key], current.timeIntervalSince(last) < window {
        return false
      }

      if timestamps[key] != nil {
        insertionOrder.removeAll { $0 == key }
      }
      insertionOrder.append(key)
      timestamps[key] = current
      trim(now: current)
      return true
    }
  }

  func forget(key: String) {
    queue.sync {
      timestamps.removeValue(forKey: key)
      insertionOrder.removeAll { $0 == key }
    }
  }

  func clear() {
    queue.sync {
      timestamps.removeAll()
      insertionOrder.removeAll()
    }
  }

  private func trim(now: Date) {
    guard timestamps.count > maxEntries else {
      return
    }

    let staleKeys = timestamps.compactMap { key, value in
      now.timeIntervalSince(value) > window ? key : nil
    }
    for key in staleKeys {
      timestamps.removeValue(forKey: key)
    }
    if !staleKeys.isEmpty {
      let stale = Set(staleKeys)
      insertionOrder.removeAll { stale.contains($0) }
    }

    var overBudget = timestamps.count - maxEntries
    guard overBudget > 0 else {
      return
    }

    while overBudget > 0, !insertionOrder.isEmpty {
      let oldest = insertionOrder.removeFirst()
      if timestamps.removeValue(forKey: oldest) != nil {
        overBudget -= 1
      }
    }
  }
}
