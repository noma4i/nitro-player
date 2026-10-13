@testable import NitroPlayPlayerCore
import XCTest

final class PlaybackWatchdogPolicyTests: XCTestCase {
  private func evaluate(
    start: Double = 1,
    current: Double = 1,
    duration: Double = 60,
    loop: Bool = false,
    loopWrapped: Bool = false,
    loaded: Bool = true,
    attempts: Int = 0,
    maxAttempts: Int = 3,
    escalationUsed: Bool = false,
    cooldownElapsed: Bool = false,
    cooldownCycles: Int = 0,
    maxCooldownCycles: Int = 2,
    requiresVisualReadiness: Bool = false,
    visuallyReady: Bool = true
  ) -> PlaybackWatchdogDecision {
    PlaybackWatchdogPolicy.evaluate(
      startSeconds: start,
      currentSeconds: current,
      durationSeconds: duration,
      loop: loop,
      loopWrapped: loopWrapped,
      hasLoadedCurrentSource: loaded,
      attempts: attempts,
      maxAttempts: maxAttempts,
      escalationUsed: escalationUsed,
      cooldownElapsed: cooldownElapsed,
      requiresVisualReadiness: requiresVisualReadiness,
      visuallyReady: visuallyReady,
      cooldownCycles: cooldownCycles,
      maxCooldownCycles: maxCooldownCycles
    )
  }

  func testAdvancingClockResetsAttempts() {
    let decision = evaluate(current: 2, attempts: 2)
    XCTAssertEqual(decision.action, .resetAndRearm)
    XCTAssertEqual(decision.attempts, 0)
  }

  func testAdvancingClockWithoutVisualReadinessKeepsRecovering() {
    let decision = evaluate(current: 2, requiresVisualReadiness: true, visuallyReady: false)
    XCTAssertEqual(decision.action, .recoverStalledPlayback)
  }

  func testStalledClockRecoversThenEscalatesThenCoolsDown() {
    XCTAssertEqual(evaluate(attempts: 0).action, .recoverStalledPlayback)
    XCTAssertEqual(evaluate(loaded: false, attempts: 0).action, .rearm)
    XCTAssertEqual(evaluate(attempts: 2).action, .escalateSource)
    XCTAssertEqual(evaluate(attempts: 2, escalationUsed: true).action, .enterCooldown)
  }

  func testCooldownRecoversUntilCycleLimitThenTerminates() {
    XCTAssertEqual(evaluate(cooldownElapsed: true, cooldownCycles: 1).action, .recoverStalledPlayback)
    XCTAssertEqual(evaluate(cooldownElapsed: true, cooldownCycles: 2).action, .terminate)
  }

  func testNearEndIsHealthyOnlyWithoutLoop() {
    XCTAssertEqual(evaluate(current: 59.9, duration: 60).action, .resetAndRearm)
    XCTAssertEqual(evaluate(start: 59.9, current: 59.9, duration: 60, loop: true).action, .recoverStalledPlayback)
  }

  func testLoopWrapCountsAsProgress() {
    XCTAssertTrue(PlaybackWatchdogPolicy.hasClockAdvanced(startSeconds: 9, currentSeconds: 0.1, loopWrapped: true))
    XCTAssertFalse(PlaybackWatchdogPolicy.hasClockAdvanced(startSeconds: 9, currentSeconds: .nan, loopWrapped: false))
  }

  func testWindowDelayDependsOnProgressAndCooldown() {
    XCTAssertEqual(PlaybackWatchdogPolicy.playbackWatchdogWindowDelayNs(hasObservedClockProgress: true, isCoolingDown: false), 3_000_000_000)
    XCTAssertEqual(PlaybackWatchdogPolicy.playbackWatchdogWindowDelayNs(hasObservedClockProgress: false, isCoolingDown: false), 12_000_000_000)
    XCTAssertEqual(PlaybackWatchdogPolicy.playbackWatchdogWindowDelayNs(hasObservedClockProgress: true, isCoolingDown: true), 15_000_000_000)
  }
}
