import Foundation

final class MainThreadResourceExecutor {
  func run<Result>(_ operation: () -> Result) -> Result {
    if Thread.isMainThread {
      return operation()
    }

    return DispatchQueue.main.sync(execute: operation)
  }
}
