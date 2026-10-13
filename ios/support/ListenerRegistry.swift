import Foundation
import NitroModules

struct ListenerEntry {
  let id: UUID
  let eventName: String
  let callback: Any
}

final class ListenerRegistry {
  private var listeners: [ListenerEntry] = []
  private let lock = NSLock()

  func add<T>(event: String, listener: T) -> ListenerSubscription {
    let id = UUID()
    lock.lock()
    listeners.append(ListenerEntry(id: id, eventName: event, callback: listener))
    lock.unlock()
    return ListenerSubscription(remove: { [weak self] in self?.remove(id: id) })
  }

  func emit<T>(event: String, invoke: (T) throws -> Void) {
    lock.lock()
    let ids = listeners.compactMap { $0.eventName == event ? $0.id : nil }
    lock.unlock()
    for id in ids {
      // Re-resolve before invoking so removed listeners are not called.
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

  private func remove(id: UUID) {
    lock.lock()
    listeners.removeAll { $0.id == id }
    lock.unlock()
  }
}
