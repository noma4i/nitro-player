import Foundation

// Nitro-free core of the listener registry. The lifetime-critical emit/remove
// logic - including the snapshot-then-re-resolve guard behind the Sentry
// YUPIV3-TN fix (a listener removed mid-emit must not be invoked) - lives here so
// it is unit-testable in the headless SwiftPM target. The thin Nitro wrapper
// (ListenerRegistry) only adapts add() into a ListenerSubscription.
struct ListenerEntry {
  let id: UUID
  let eventName: String
  let callback: Any
}

final class ListenerRegistryCore {
  private var listeners: [ListenerEntry] = []
  private let lock = NSLock()

  // Returns the subscription id; the caller builds its own unsubscribe handle.
  func add<T>(event: String, listener: T) -> UUID {
    let id = UUID()
    lock.lock()
    listeners.append(ListenerEntry(id: id, eventName: event, callback: listener))
    lock.unlock()
    return id
  }

  func emit<T>(event: String, invoke: (T) throws -> Void) {
    lock.lock()
    let ids = listeners.compactMap { $0.eventName == event ? $0.id : nil }
    lock.unlock()
    for id in ids {
      // Re-resolve under the lock right before invoking: if the listener was
      // removed (e.g. JS unsubscribed on unmount) between the snapshot and now,
      // skip it instead of invoking a callback whose JS owner may already be gone.
      lock.lock()
      let callback = listeners.first(where: { $0.id == id })?.callback
      lock.unlock()
      guard let typed = callback as? T else { continue }
      try? invoke(typed)
    }
  }

  func clearAll() {
    lock.lock()
    listeners.removeAll()
    lock.unlock()
  }

  func hasListeners(event: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return listeners.contains { $0.eventName == event }
  }

  func remove(id: UUID) {
    lock.lock()
    listeners.removeAll { $0.id == id }
    lock.unlock()
  }
}
