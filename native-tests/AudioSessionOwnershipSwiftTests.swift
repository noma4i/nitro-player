import Foundation

private struct TestApplyError: Error {}

private final class FakeApplyPipeline {
  struct Pending {
    let mode: NativeAudioSessionTargetMode
    let completion: (Error?) -> Void
  }

  var pending: [Pending] = []
  var syncApplies: [NativeAudioSessionTargetMode] = []
  var submitCount = 0
  var downgradeCallbacks: [() -> Void] = []

  func makeCoordinator() -> NativeAudioSessionCoordinator {
    NativeAudioSessionCoordinator(
      submitApply: { [self] mode, completion in
        submitCount += 1
        pending.append(Pending(mode: mode, completion: completion))
      },
      applySync: { [self] mode in
        syncApplies.append(mode)
      },
      scheduleDowngrade: { [self] callback in
        downgradeCallbacks.append(callback)
      }
    )
  }

  @discardableResult
  func completeNext(error: Error? = nil) -> Bool {
    guard !pending.isEmpty else {
      return false
    }

    let next = pending.removeFirst()
    next.completion(error)
    return true
  }

  func drainDowngrades() {
    let callbacks = downgradeCallbacks
    downgradeCallbacks = []
    for callback in callbacks {
      callback()
    }
  }
}

private final class FakePlaybackAudioRuntime: NativePlaybackAudioSessionRuntimeProtocol {
  private(set) var acquired: [(key: String, policy: NativePlaybackAudioPolicy)] = []
  private(set) var updated: [NativePlaybackAudioPolicy] = []
  private(set) var released: [NativePlaybackAudioLease] = []
  private(set) var retryCount = 0
  private var nextOwnerId: UInt64 = 1
  private var nextLeaseId: UInt64 = 1

  var leaseCount: Int {
    acquired.count - released.count
  }

  func acquirePlayback(key: String, policy: NativePlaybackAudioPolicy) -> NativePlaybackAudioLease {
    acquired.append((key: key, policy: policy))
    let lease = NativePlaybackAudioLease(
      ownerId: nextOwnerId,
      coordinatorLease: NativeAudioSessionLease(key: key, leaseId: nextLeaseId)
    )
    nextOwnerId += 1
    nextLeaseId += 1
    return lease
  }

  func updatePlayback(_ lease: NativePlaybackAudioLease, policy: NativePlaybackAudioPolicy) {
    updated.append(policy)
  }

  func releasePlayback(_ lease: NativePlaybackAudioLease) {
    released.append(lease)
  }

  func retry() {
    retryCount += 1
  }
}

@main
struct AudioSessionOwnershipSwiftTests {
  static var failures = 0

  static func verify(_ name: String, _ condition: Bool, _ detail: @autoclosure () -> String = "") {
    if condition {
      print("PASS \(name)")
    } else {
      failures += 1
      print("FAIL \(name) \(detail())")
    }
  }

  static func main() {
    testAcquireDoesNotBlockCaller()
    testRapidFlipsCoalesce()
    testExternalSessionSyncInvalidatesInFlight()
    testErrorDoesNotAutoRetry()
    testMediaServicesResetReappliesOnce()
    testLateReacquireCancelsDowngradeApply()
    testBindingHoldsLeaseForTransportIntent()
    testBindingReleasesLeaseOnPause()
    testBindingPolicyChangeKeepsSingleLease()

    if failures > 0 {
      print("FAILED: \(failures) case(s)")
      exit(1)
    }
    print("OK: all cases passed")
  }

  static func testAcquireDoesNotBlockCaller() {
    let pipeline = FakeApplyPipeline()
    let coordinator = pipeline.makeCoordinator()

    coordinator.acquire(key: "playback")
    verify("acquire submits XPC off the calling path", pipeline.pending.count == 1 && pipeline.syncApplies.isEmpty)
    verify("appliedMode not committed before completion", coordinator.snapshot.appliedMode == nil)

    pipeline.completeNext()
    verify("completion commits appliedMode=playback", coordinator.snapshot.appliedMode == .playback)
    verify("completion clears lastError", coordinator.snapshot.lastError == nil)
  }

  static func testRapidFlipsCoalesce() {
    let pipeline = FakeApplyPipeline()
    let coordinator = pipeline.makeCoordinator()

    let lease1 = coordinator.acquire(key: "playback")
    coordinator.release(lease1)
    let lease2 = coordinator.acquire(key: "playback")
    coordinator.release(lease2)
    verify("only one XPC in flight during rapid flips", pipeline.submitCount == 1, "got \(pipeline.submitCount)")

    pipeline.completeNext()
    pipeline.drainDowngrades()
    verify("coalesced settle needs one downgrade apply", pipeline.submitCount == 2, "got \(pipeline.submitCount)")
    pipeline.completeNext()
    verify("final applied mode is the latest target", coordinator.snapshot.appliedMode == .inactive)
  }

  static func testExternalSessionSyncInvalidatesInFlight() {
    let pipeline = FakeApplyPipeline()
    let coordinator = pipeline.makeCoordinator()

    coordinator.acquire(key: "playback")
    verify("playback apply pending before external session", pipeline.pending.count == 1)

    _ = coordinator.beginExternalAudioSession()
    verify("external session deactivates synchronously", pipeline.syncApplies == [.inactive])
    verify("external session commits appliedMode=inactive", coordinator.snapshot.appliedMode == .inactive)

    pipeline.completeNext()
    verify("stale in-flight completion is ignored", coordinator.snapshot.appliedMode == .inactive)
  }

  static func testErrorDoesNotAutoRetry() {
    let pipeline = FakeApplyPipeline()
    let coordinator = pipeline.makeCoordinator()

    coordinator.acquire(key: "playback")
    pipeline.completeNext(error: TestApplyError())
    verify("failed apply records lastError", coordinator.snapshot.lastError != nil)
    verify("failed apply drops appliedMode", coordinator.snapshot.appliedMode == nil)
    verify("failed apply does not auto-retry", pipeline.pending.isEmpty && pipeline.submitCount == 1, "submits \(pipeline.submitCount)")

    coordinator.retry()
    verify("explicit retry submits exactly one apply", pipeline.pending.count == 1 && pipeline.submitCount == 2, "submits \(pipeline.submitCount)")
  }

  static func testMediaServicesResetReappliesOnce() {
    let pipeline = FakeApplyPipeline()
    let coordinator = pipeline.makeCoordinator()

    coordinator.acquire(key: "playback")
    pipeline.completeNext()
    verify("setup applied playback", coordinator.snapshot.appliedMode == .playback)

    coordinator.handleMediaServicesReset()
    verify("media reset deactivates synchronously", pipeline.syncApplies == [.inactive])
    verify("media reset re-applies playback once async", pipeline.pending.count == 1 && pipeline.pending[0].mode == .playback)

    pipeline.completeNext()
    verify("recovered applied playback", coordinator.snapshot.appliedMode == .playback)
  }

  static func testLateReacquireCancelsDowngradeApply() {
    let pipeline = FakeApplyPipeline()
    let coordinator = pipeline.makeCoordinator()

    let lease = coordinator.acquire(key: "playback")
    pipeline.completeNext()
    coordinator.release(lease)
    verify("release schedules a deferred downgrade", pipeline.downgradeCallbacks.count == 1 && pipeline.submitCount == 1)

    coordinator.acquire(key: "playback")
    pipeline.drainDowngrades()
    verify("re-acquire wins over pending downgrade", coordinator.snapshot.appliedMode == .playback)
    verify("no extra apply for cancelled downgrade", pipeline.submitCount == 1, "submits \(pipeline.submitCount)")
  }

  static func testBindingHoldsLeaseForTransportIntent() {
    let runtime = FakePlaybackAudioRuntime()
    let binding = PlaybackAudioSessionBinding(key: "player", runtime: runtime)

    binding.prepareToPlay(policy: .automatic)
    verify("transport intent acquires one lease", runtime.leaseCount == 1, "leases \(runtime.leaseCount)")

    binding.prepareToPlay(policy: .automatic)
    verify("repeated intent reuses the lease", runtime.acquired.count == 1, "acquires \(runtime.acquired.count)")
    verify("repeated intent re-asserts via retry", runtime.retryCount == 1, "retries \(runtime.retryCount)")
  }

  static func testBindingReleasesLeaseOnPause() {
    let runtime = FakePlaybackAudioRuntime()
    let binding = PlaybackAudioSessionBinding(key: "player", runtime: runtime)

    binding.prepareToPlay(policy: .automatic)
    binding.pause()
    verify("pause releases the lease", runtime.leaseCount == 0, "leases \(runtime.leaseCount)")

    binding.pause()
    verify("second pause does not double release", runtime.released.count == 1, "releases \(runtime.released.count)")
  }

  static func testBindingPolicyChangeKeepsSingleLease() {
    let runtime = FakePlaybackAudioRuntime()
    let binding = PlaybackAudioSessionBinding(key: "player", runtime: runtime)
    let mixing = NativePlaybackAudioPolicy(mix: .mixWithOthers, silent: .obey)

    binding.prepareToPlay(policy: .automatic)
    binding.updatePolicy(mixing)
    verify("policy change keeps one lease", runtime.leaseCount == 1 && runtime.acquired.count == 1, "acquires \(runtime.acquired.count)")
    verify("policy change updates the lease", runtime.updated == [mixing], "updates \(runtime.updated.count)")

    binding.updatePolicy(mixing)
    verify("unchanged policy does not re-update", runtime.updated.count == 1, "updates \(runtime.updated.count)")
  }
}
