import Foundation

struct HlsProxyRuntimeStateSnapshot {
  let port: Int
  let didAutoStart: Bool
  let isExplicitlyStopped: Bool
}

struct HlsProxyRuntimeLifecycleState {
  private let defaultPort: Int
  private(set) var port: Int
  private(set) var didAutoStart = false
  private(set) var isExplicitlyStopped = false

  init(defaultPort: Int = 0) {
    self.defaultPort = defaultPort
    self.port = defaultPort
  }

  mutating func start(port requestedPort: Int?) -> Int {
    let candidate = requestedPort ?? defaultPort
    let resolvedPort = candidate > 0 ? candidate : defaultPort
    port = resolvedPort
    didAutoStart = false
    isExplicitlyStopped = false
    return resolvedPort
  }

  mutating func stop() {
    isExplicitlyStopped = true
    didAutoStart = false
  }

  mutating func suspendForHostLifecycle() {
    didAutoStart = false
  }

  func portForImplicitStart() -> Int? {
    guard !isExplicitlyStopped, !didAutoStart else {
      return nil
    }
    return port
  }

  mutating func markAutoStarted() {
    guard !isExplicitlyStopped else {
      return
    }
    didAutoStart = true
  }

  func portForPlaybackRecoveryRestart() -> Int? {
    guard !isExplicitlyStopped else {
      return nil
    }
    return port
  }

  func snapshot() -> HlsProxyRuntimeStateSnapshot {
    HlsProxyRuntimeStateSnapshot(
      port: port,
      didAutoStart: didAutoStart,
      isExplicitlyStopped: isExplicitlyStopped
    )
  }
}
