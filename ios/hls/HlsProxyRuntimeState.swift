import Foundation

final class HlsProxyRuntimeState {
  private let defaultPort: Int

  private(set) var port: Int
  private var isRegistered = false
  private var shouldBeRunning = false
  private var isExplicitlyStopped = false

  init(defaultPort: Int = 18181) {
    self.defaultPort = defaultPort
    self.port = defaultPort
  }

  @discardableResult
  func register() -> Int {
    isRegistered = true
    shouldBeRunning = true
    isExplicitlyStopped = false
    return port
  }

  @discardableResult
  func start(port requestedPort: Int?) -> Int {
    let resolvedPort = (requestedPort ?? defaultPort) > 0 ? (requestedPort ?? defaultPort) : defaultPort
    port = resolvedPort
    isRegistered = true
    shouldBeRunning = true
    isExplicitlyStopped = false
    return port
  }

  func stop() {
    shouldBeRunning = false
    isExplicitlyStopped = true
  }

  func shouldEnsureRunningForUse() -> Bool {
    isRegistered && shouldBeRunning && !isExplicitlyStopped
  }
}
