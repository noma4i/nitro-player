import Foundation

final class MainThreadResourceExecutor {
  func runAsync(_ operation: @escaping () -> Void) {
    if Thread.isMainThread {
      operation()
      return
    }

    DispatchQueue.main.async(execute: operation)
  }

  /// Sync bridge. Never pass a closure that mutates `player`/`playerItem`, invalidates
  /// observers, or reads a live (non-cached) AVFoundation property: from a non-main
  /// thread this blocks the caller, and when main is itself stalled inside
  /// MediaToolbox (concurrent item invalidation holds the fig-mutex) the wait becomes
  /// an unrecoverable app hang (release 3.7.0 "App Hang Fully Blocked" incident).
  /// Use `runAsync`, or `await MainActor.run` from an async context, for anything that
  /// touches AVFoundation; keep this for lightweight flag/cache reads only.
  func run<Result>(_ operation: () -> Result) -> Result {
    if Thread.isMainThread {
      return operation()
    }

    return DispatchQueue.main.sync(execute: operation)
  }
}
