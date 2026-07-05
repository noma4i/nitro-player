import Foundation

enum PeriodicTimeObserverAction: Equatable {
  case install
  case remove
  case none
}

struct PeriodicTimeObserverLifecycle {
  private(set) var isInstalled = false

  mutating func update(hasCurrentItem: Bool) -> PeriodicTimeObserverAction {
    if hasCurrentItem {
      guard !isInstalled else { return .none }
      isInstalled = true
      return .install
    }

    guard isInstalled else { return .none }
    isInstalled = false
    return .remove
  }

  mutating func invalidate() -> PeriodicTimeObserverAction {
    update(hasCurrentItem: false)
  }
}
