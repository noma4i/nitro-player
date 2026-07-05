import Foundation

struct SourceCommandBeginResult: Equatable {
  let generation: Int
  let shouldAutoPlay: Bool
}

final class SourceCommandCoordinator {
  private let lifecycleGate: LifecycleGate

  init(lifecycleGate: LifecycleGate) {
    self.lifecycleGate = lifecycleGate
  }

  func begin(allowAutoPlay: Bool, wantsToPlay: inout Bool) -> SourceCommandBeginResult? {
    guard !lifecycleGate.isReleased else { return nil }

    let shouldAutoPlay = allowAutoPlay && wantsToPlay
    wantsToPlay = false
    return SourceCommandBeginResult(
      generation: lifecycleGate.beginGeneration(),
      shouldAutoPlay: shouldAutoPlay
    )
  }
}
