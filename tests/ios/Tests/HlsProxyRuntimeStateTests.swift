import XCTest
@testable import NitroPlayLogic

final class HlsProxyRuntimeStateTests: XCTestCase {
  func testRegisterEnablesProxyUse() {
    let state = HlsProxyRuntimeState()

    let port = state.register()

    XCTAssertEqual(port, 18181)
    XCTAssertTrue(state.shouldEnsureRunningForUse())
  }

  func testStartUpdatesPortAndClearsExplicitStop() {
    let state = HlsProxyRuntimeState()
    _ = state.register()
    state.stop()

    let port = state.start(port: 19191)

    XCTAssertEqual(port, 19191)
    XCTAssertTrue(state.shouldEnsureRunningForUse())
  }

  func testStopDisablesProxyUseUntilExplicitStart() {
    let state = HlsProxyRuntimeState()
    _ = state.register()

    state.stop()

    XCTAssertFalse(state.shouldEnsureRunningForUse())
  }

  func testRequestPathDoesNotBootstrapUnregisteredRuntime() {
    let state = HlsProxyRuntimeState()

    XCTAssertFalse(state.shouldEnsureRunningForUse())
  }
}
