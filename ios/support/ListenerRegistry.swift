import Foundation
import NitroModules

// Thin Nitro adapter over ListenerRegistryCore: turns add() into a
// ListenerSubscription. All lifetime-critical logic (emit re-resolve, remove,
// clearAll) lives in the Nitro-free core so it is unit-testable in SwiftPM.
final class ListenerRegistry {
  private let core = ListenerRegistryCore()

  func add<T>(event: String, listener: T) -> ListenerSubscription {
    let id = core.add(event: event, listener: listener)
    return ListenerSubscription(remove: { [weak core] in core?.remove(id: id) })
  }

  func emit<T>(event: String, invoke: (T) throws -> Void) {
    core.emit(event: event, invoke: invoke)
  }

  func clearAll() {
    core.clearAll()
  }

  func hasListeners(event: String) -> Bool {
    core.hasListeners(event: event)
  }
}
