//
//  HybridNitroPlayer.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 09/10/2024.
//

import AVFoundation
import Foundation
import NitroModules

struct RingSlotDiagnostics {
  let slotId: Int
  let assignedIndex: Int?
  let awaitingSourceCommit: Bool
  let desiredPlay: Bool
  let lastTransition: String
}

protocol RingSlotDiagnosticsProviding: AnyObject {
  func ringSlotDiagnostics() -> RingSlotDiagnostics
}

private enum InactiveNitroPlayerSource {
  static let shared: HybridNitroPlayerSource = {
    let config = NativeNitroPlayerConfig(
      uri: "file:///dev/null",
      headers: nil,
      startup: .eager,
      buffer: nil,
      retention: nil,
      transport: nil
    )
    return try! HybridNitroPlayerSource(config: config)
  }()
}

class HybridNitroPlayer: HybridNitroPlayerSpec, @unchecked Sendable {
  struct SourceCommand {
    let generation: Int
    let oldSource: HybridNitroPlayerSource?
    let shouldAutoPlay: Bool
  }

  internal enum PlaybackPreparationTicket {
    case watchdog(UInt64)
    case startup(UInt64)
    case direct(UInt64)
  }

  private struct PlaybackSnapshot {
    let status: NitroPlayerStatus
    let currentTime: Double
    let duration: Double
    let bufferDuration: Double
    let bufferedPosition: Double
    let rate: Double
    let isPlaying: Bool
    let isBuffering: Bool
    let isVisualReady: Bool
    let error: Variant_NullType_PlaybackError?
    let nativeTimestampMs: Double
    let fingerprint: PlaybackStateFingerprint
  }

  private struct PlaybackMetrics {
    var currentTime: Double = 0
    var duration: Double = Double.nan
    var bufferDuration: Double = 0
    var rate: Double = 0
    var timeControlStatus: AVPlayer.TimeControlStatus = .paused
  }

  /**
   * Player instance for video playback
   */
  var player: AVPlayer {
    didSet {
      playerObserver?.initializePlayerObservers()
      applyLoopMode()
    }
    willSet {
      playerObserver?.invalidatePlayerObservers()
    }
  }

  var playerItem: AVPlayerItem? {
    willSet {
      seekToken &+= 1
    }
    didSet {
      hasObservedClockProgress = false
      hasPrerolledCurrentItem = false
      if let bufferConfig = currentSourceConfig()?.buffer {
        playerItem?.setBufferConfig(config: bufferConfig)
      }
      updateCachedItemMemoryBytes(playerItem?.asset.estimatedMemoryUsage ?? 0)
    }
  }

  // Nitro reads `memorySize` straight from the calling (JS) thread, so the value is
  // kept in a lock-protected cache written by the main-confined `playerItem` didSet
  // instead of a main.sync hop that would block JS behind a stalled main thread.
  private let cachedItemMemoryBytesLock = NSLock()
  private var cachedItemMemoryBytes = 0

  private func updateCachedItemMemoryBytes(_ bytes: Int) {
    cachedItemMemoryBytesLock.lock()
    defer { cachedItemMemoryBytesLock.unlock() }
    cachedItemMemoryBytes = bytes
  }
  var playerObserver: NitroPlayerObserver?
  let sourceLoader = SourceLoader()
  let mainThreadExecutor = MainThreadResourceExecutor()
  var preparationTask: Task<Void, Never>?
  private var preparationTaskToken: UInt64 = 0
  let lifecycleGate = LifecycleGate()
  var isReleased: Bool { lifecycleGate.isReleased }
  var hasActiveSource = false
  var lastError: PlaybackError?
  var readyToDisplay = false
  var resumePositionSeconds: Double = 0
  private var attachedVideoViewIds = Set<ObjectIdentifier>()
  var isAttachedToVideoView: Bool { !attachedVideoViewIds.isEmpty }
  private var playbackBinding: PlaybackSessionBinding?
  weak var ringSlotDiagnosticsProvider: (any RingSlotDiagnosticsProviding)?
  internal var isRingSlot = false
  lazy var playbackAudioSessionBinding = PlaybackAudioSessionBinding(
    key: "nitro-player:\(ObjectIdentifier(self))",
    runtime: NativeAudioSessionRuntime.shared
  )
  private var playbackActive = false
  private var playbackVisible = false
  private var playbackRequiresView = true
  var hasPlaybackBinding: Bool { playbackBinding != nil }
  var pendingTrimWorkItem: DispatchWorkItem?
  private var pendingBoundErrorRecoveryWorkItem: DispatchWorkItem?
  private var boundErrorRecoveryAttempts = 0
  var startupRecoveryTask: Task<Void, Never>?
  private var startupRecoveryToken: UInt64 = 0
  var sourceGeneration: Int { lifecycleGate.generation }
  var startupRecoveryAttempts: Int = 0
  var hasLoadedCurrentSource = false
  var hasPrerolledCurrentItem = false
  private let playbackStateEmissionGate = PlaybackStateEmissionGate()
  private var playbackMetrics = PlaybackMetrics()
  private var desiredPlaybackRate: Float = 1.0
  private var hasObservedClockProgress = false
  private var playbackWatchdogIsCoolingDown = false
  private var playbackWatchdogCooldownCycles = 0
  private var renderFailureAudioSessionRecoveryGeneration: Int?

  private let startupRecoveryDelayNs: UInt64 = 250_000_000
  private let maxStartupRecoveryAttempts = 1

  // Playback-start watchdog: a loaded item can stall before advancing with no error event, so the
  // onError-driven startup recovery never fires. This re-prepares such a loaded-but-frozen item.
  var playbackWatchdogTask: Task<Void, Never>?
  private var playbackWatchdogToken: UInt64 = 0
  var playbackWatchdogAttempts: Int = 0
  var playbackWatchdogEscalatedGeneration: Int?
  var loopWrapCount: Int = 0
  private var seekToken: UInt64 = 0
  private let maxPlaybackWatchdogAttempts = 5

  func replaceCurrentItem(_ item: AVPlayerItem?) {
    let apply = { [weak self] in
      // Allow the release-time nil-clear even when released, but block a stale
      // non-nil re-attach that was queued before release ran.
      guard let self, !self.isReleased || item == nil else { return }
      self.player.replaceCurrentItem(with: item)
    }

    if Thread.isMainThread {
      apply()
      return
    }

    DispatchQueue.main.async(execute: apply)
  }

  override init() {
    precondition(Thread.isMainThread, "HybridNitroPlayer must be created on the main thread")
    self.eventEmitter = HybridNitroPlayerEventEmitter()

    self.player = AVPlayer()
    self.player.automaticallyWaitsToMinimizeStalling = false

    super.init()
    self.playerObserver = NitroPlayerObserver(delegate: self)
    self.playerObserver?.initializePlayerObservers()
    NitroPlayerManager.shared.register(player: self)
  }

  convenience init(source: (any HybridNitroPlayerSourceSpec)) throws {
    self.init()
    mainThreadExecutor.run { [weak self] in
      guard let self else { return }

      self.sourceStorage = source
      self.hasActiveSource = true
      self.beginSourceGeneration()

      guard self.resolvedInitialization() == .eager,
            let activeSource = self.currentHybridSource() else {
        return
      }
      let generation = self.sourceGeneration

      switch self.resolvedPreloadLevel() {
      case .buffered:
        let capturedToken = self.beginPreparationTask()
        self.preparationTask = Task.detached(priority: .userInitiated) { [weak self] in
          guard let self else { return }

          do {
            try await self.prepareBufferedState(
              expectedSource: activeSource,
              expectedGeneration: generation,
              expectedPlaybackPreparationTicket: .direct(capturedToken)
            )
          } catch {
            // Ignore cancellation errors during initialization
          }

          self.mainThreadExecutor.run { [weak self] in
            guard let self,
                  self.isPlaybackPreparationTicketCurrent(.direct(capturedToken)),
                  !self.isReleased,
                  self.sourceGeneration == generation,
                  let currentSource = self.currentHybridSource(),
                  (activeSource as AnyObject) === (currentSource as AnyObject) else {
              return
            }
            self.preparationTask = nil
          }
        }
      case .metadata:
        let capturedToken = self.beginPreparationTask()
        self.preparationTask = Task.detached(priority: .userInitiated) { [weak self] in
          guard let self else { return }

          let shouldWarm = self.mainThreadExecutor.run { [weak self] in
            guard let self,
                  self.isPlaybackPreparationTicketCurrent(.direct(capturedToken)),
                  !self.isReleased,
                  self.sourceGeneration == generation,
                  let currentSource = self.currentHybridSource(),
                  (activeSource as AnyObject) === (currentSource as AnyObject) else {
              return false
            }
            return true
          }
          guard shouldWarm else { return }

          do {
            try await activeSource.warmMetadata()
          } catch {
            // Ignore cancellation errors during initialization
          }

          self.mainThreadExecutor.run { [weak self] in
            guard let self,
                  self.isPlaybackPreparationTicketCurrent(.direct(capturedToken)),
                  !self.isReleased,
                  self.sourceGeneration == generation,
                  let currentSource = self.currentHybridSource(),
                  (activeSource as AnyObject) === (currentSource as AnyObject) else {
              return
            }
            self.preparationTask = nil
          }
        }
      case .none:
        return
      }
    }
  }

  deinit {
    // Backstop for a player that was never explicitly released. release() cannot be
    // reused here: its deferred teardown block captures self strongly, which is
    // illegal from deinit. Deinit has exclusive access to self, so reading the
    // main-confined resources to capture them without self is safe.
    guard lifecycleGate.markReleased() else { return }

    pendingTrimWorkItem?.cancel()
    startupRecoveryTask?.cancel()
    playbackWatchdogTask?.cancel()
    preparationTask?.cancel()
    sourceLoader.cancelDetached()

    let orphanedPlayer = player
    let orphanedObserver = playerObserver
    let orphanedAudioBinding = playbackAudioSessionBinding
    let orphanedSessionBinding = playbackBinding
    let orphanedSource = currentHybridSource()
    let orphanedEmitter = _eventEmitter
    let teardown = {
      orphanedObserver?.invalidatePlayerItemObservers()
      orphanedObserver?.invalidatePlayerObservers()
      orphanedPlayer.pause()
      orphanedPlayer.replaceCurrentItem(with: nil)
      orphanedSessionBinding?.release()
      orphanedAudioBinding.release()
      orphanedSource?.trimToCold()
      try? orphanedEmitter?.clearAllListeners()
    }
    if Thread.isMainThread {
      teardown()
    } else {
      DispatchQueue.main.async(execute: teardown)
    }
  }

  // MARK: - Hybrid Impl

  var sourceStorage: (any HybridNitroPlayerSourceSpec)?

  var source: any HybridNitroPlayerSourceSpec {
    mainThreadExecutor.run {
      sourceStorage ?? InactiveNitroPlayerSource.shared
    }
  }

  private var storedStatus: NitroPlayerStatus = .idle
  var status: NitroPlayerStatus {
    get {
      mainThreadExecutor.run {
        storedStatus
      }
    }
    set {
      mainThreadExecutor.run {
        storedStatus = newValue
      }
    }
  }
  var wantsToPlay = false

  func diagnosticsSnapshot(
    coordinatorSnapshot: PlaybackSessionCoordinatorSnapshot
  ) -> [String: Any] {
    precondition(Thread.isMainThread)

    let binding = playbackBinding?.snapshot()
    let session = coordinatorSnapshot.sessions.first { session in
      session.key == binding?.key && session.leaseId == binding?.leaseId
    }
    let ringSlot = ringSlotDiagnosticsProvider?.ringSlotDiagnostics()
    return [
      "key": binding?.key ?? NSNull(),
      "group": binding?.policy?.group ?? NSNull(),
      "priority": binding?.policy?.priority ?? NSNull(),
      "requested": binding?.requested ?? false,
      "eligibility": [
        "active": playbackActive,
        "visible": playbackVisible,
        "attached": isAttachedToVideoView,
        "requiresView": playbackRequiresView
      ],
      "intent": session.map { String(describing: $0.intent) } ?? "idle",
      "effectiveState": session.map { String(describing: $0.effectiveState) } ?? "paused",
      "retentionLevel": diagnosticsRetentionLevel(),
      "wantsToPlay": wantsToPlay,
      "hasActiveSource": hasActiveSource,
      "isRingSlot": isRingSlot,
      "status": status.stringValue,
      "ringSlot": ringSlot.map { slot in
        [
          "slotId": slot.slotId,
          "assignedIndex": slot.assignedIndex ?? NSNull(),
          "awaitingSourceCommit": slot.awaitingSourceCommit,
          "desiredPlay": slot.desiredPlay,
          "lastTransition": slot.lastTransition
        ] as [String: Any]
      } ?? NSNull()
    ]
  }

  private func diagnosticsRetentionLevel() -> String {
    switch currentRetentionState() {
    case .hot:
      return "hot"
    case .metadata:
      return "metadata"
    case .cold:
      return "cold"
    @unknown default:
      return "cold"
    }
  }

  let eventEmitter: HybridNitroPlayerEventEmitterSpec
  var _eventEmitter: HybridNitroPlayerEventEmitter? {
    return eventEmitter as? HybridNitroPlayerEventEmitter
  }

  private var userVolume: Float = 1.0

  var volume: Double {
    set {
      mainThreadExecutor.runAsync { [self] in
        guard !isReleased else { return }
        userVolume = Float(newValue)
        player.volume = Float(newValue)
      }
    }
    get {
      mainThreadExecutor.run {
        guard !isReleased else { return Double(userVolume) }
        return Double(player.volume)
      }
    }
  }

  var muted: Bool {
    set {
      mainThreadExecutor.runAsync { [self] in
        guard !isReleased else { return }
        if newValue {
          if !player.isMuted {
            userVolume = player.volume
          }
          player.volume = 0
        } else {
          player.volume = userVolume
        }
        player.isMuted = newValue
        _eventEmitter?.onVolumeChange(
          onVolumeChangeData(
            volume: Double(player.volume),
            muted: newValue
          )
        )
      }
    }
    get {
      mainThreadExecutor.run {
        guard !isReleased else { return false }
        return player.isMuted
      }
    }
  }

  var currentTime: Double {
    set {
      mainThreadExecutor.runAsync { [self] in
        let requestedTime = clampedPlaybackTime(newValue)
        resumePositionSeconds = requestedTime
        updateCachedProgress(currentTime: requestedTime)
        emitPlaybackState()

        guard !isReleased, let expectedPlayerItem = playerItem else { return }
        let expectedPlayer = player
        guard expectedPlayer.currentItem === expectedPlayerItem else { return }
        let expectedSourceGeneration = sourceGeneration
        seekToken &+= 1
        let expectedSeekToken = seekToken

        expectedPlayer.seek(
          to: CMTime(seconds: requestedTime, preferredTimescale: 1000),
          toleranceBefore: .zero,
          toleranceAfter: .zero
        ) { [weak self] finished in
          guard let self, finished else { return }
          self.mainThreadExecutor.runAsync {
            guard !self.isReleased,
                  self.sourceGeneration == expectedSourceGeneration,
                  self.player === expectedPlayer,
                  self.playerItem === expectedPlayerItem,
                  expectedPlayer.currentItem === expectedPlayerItem,
                  self.seekToken == expectedSeekToken else {
              return
            }
            self.updateCachedProgress(currentTime: requestedTime)
            self.emitPlaybackState()
          }
        }
      }
    }
    get {
      mainThreadExecutor.run {
        playbackMetrics.currentTime
      }
    }
  }

  var duration: Double {
    mainThreadExecutor.run {
      guard !isReleased else { return Double.nan }
      return playbackMetrics.duration
    }
  }

  var bufferDuration: Double {
    mainThreadExecutor.run {
      guard !isReleased else { return 0 }
      return playbackMetrics.bufferDuration
    }
  }

  var bufferedPosition: Double {
    mainThreadExecutor.run {
      playbackMetrics.currentTime + playbackMetrics.bufferDuration
    }
  }

  var rate: Double {
    set {
      mainThreadExecutor.runAsync { [self] in
        guard !isReleased else { return }
        let desiredRate = Float(newValue)
        desiredPlaybackRate = desiredRate
        if #available(iOS 16.0, tvOS 16.0, *) {
          player.defaultRate = desiredRate
        }

        if player.rate != 0 {
          player.rate = desiredRate
        }
      }
    }
    get {
      mainThreadExecutor.run {
        guard !isReleased else { return 0 }
        return Double(desiredPlaybackRate)
      }
    }
  }

  private var storedLoop = false
  var loop: Bool {
    get {
      mainThreadExecutor.run {
        storedLoop
      }
    }
    set {
      mainThreadExecutor.runAsync { [self] in
        storedLoop = newValue
        applyLoopMode()
      }
    }
  }

  private var storedMixAudioMode: MixAudioMode = .auto
  var mixAudioMode: MixAudioMode {
    get {
      mainThreadExecutor.run {
        storedMixAudioMode
      }
    }
    set {
      mainThreadExecutor.runAsync { [self] in
        storedMixAudioMode = newValue
        applyPlaybackAudioSessionPolicy()
      }
    }
  }

  private var storedIgnoreSilentSwitchMode: IgnoreSilentSwitchMode = .auto
  var ignoreSilentSwitchMode: IgnoreSilentSwitchMode {
    get {
      mainThreadExecutor.run {
        storedIgnoreSilentSwitchMode
      }
    }
    set {
      mainThreadExecutor.runAsync { [self] in
        storedIgnoreSilentSwitchMode = newValue
        applyPlaybackAudioSessionPolicy()
      }
    }
  }

  private var storedPlayInBackground = false
  var playInBackground: Bool {
    get {
      mainThreadExecutor.run {
        storedPlayInBackground
      }
    }
    set {
      mainThreadExecutor.runAsync { [self] in
        storedPlayInBackground = newValue
      }
    }
  }

  private var storedPlayWhenInactive = false
  var playWhenInactive: Bool {
    get {
      mainThreadExecutor.run {
        storedPlayWhenInactive
      }
    }
    set {
      mainThreadExecutor.runAsync { [self] in
        storedPlayWhenInactive = newValue
      }
    }
  }

  var wasAutoPaused: Bool = false

  // Text track selection state

  var isCurrentlyBuffering: Bool = false

  private func observedPlayingNow() -> Bool {
    // KVO-fed cache instead of a live AVPlayer read: this runs on every emit tick
    // and inside sync bridges, where a live MediaToolbox-backed read can deadlock
    // against a concurrent item invalidation. The signal stays honest - it is still
    // the actual status AVPlayer reported, at most one KVO delivery behind.
    PlaybackWatchdogPolicy.isObservedPlaying(
      clockAdvanced: hasObservedClockProgress,
      nativeRate: playbackMetrics.rate,
      wantsToPlay: wantsToPlay
    ) && cachedTimeControlStatus == .playing
  }

  var isPlaying: Bool {
    mainThreadExecutor.run {
      guard !isReleased else { return false }
      return observedPlayingNow()
    }
  }

  var isBuffering: Bool {
    mainThreadExecutor.run {
      isCurrentlyBuffering
    }
  }

  var isVisualReady: Bool {
    mainThreadExecutor.run {
      readyToDisplay
    }
  }

  internal func markReadyToDisplay(
    expectedPlayer: AVPlayer,
    expectedPlayerItem: AVPlayerItem
  ) {
    mainThreadExecutor.run {
      guard !isReleased,
            hasActiveSource,
            player === expectedPlayer,
            playerItem === expectedPlayerItem,
            expectedPlayer.currentItem === expectedPlayerItem else {
        return
      }
      readyToDisplay = true
      resetBoundErrorRecovery()
      emitPlaybackState()
    }
  }

  internal func markNotReadyToDisplay(
    expectedPlayer: AVPlayer,
    expectedPlayerItem: AVPlayerItem
  ) {
    mainThreadExecutor.run {
      guard !isReleased,
            hasActiveSource,
            player === expectedPlayer,
            playerItem === expectedPlayerItem,
            expectedPlayer.currentItem === expectedPlayerItem else {
        return
      }
      readyToDisplay = false
      emitPlaybackState()
    }
  }

  var playbackState: PlaybackState {
    mainThreadExecutor.run {
      playbackState(from: currentPlaybackSnapshot())
    }
  }

  private func currentPlaybackSnapshot() -> PlaybackSnapshot {
    if isReleased {
      return PlaybackSnapshot(
        status: .idle,
        currentTime: 0,
        duration: 0,
        bufferDuration: 0,
        bufferedPosition: 0,
        rate: 0,
        isPlaying: false,
        isBuffering: false,
        isVisualReady: false,
        error: nil,
        nativeTimestampMs: Date().timeIntervalSince1970 * 1000,
        fingerprint: PlaybackStateFingerprint(
          status: playbackStatusIndex(.idle),
          currentTime: 0,
          duration: 0,
          bufferDuration: 0,
          bufferedPosition: 0,
          rate: 0,
          isPlaying: false,
          isBuffering: false,
          isVisualReady: false,
          errorCode: nil,
          errorMessageHash: nil
        )
      )
    }

    let currentStatus = status
    let duration = playbackMetrics.duration
    let currentTime: Double
    if currentStatus == .ended && duration.isFinite && duration > 0 {
      currentTime = duration
    } else {
      currentTime = playbackMetrics.currentTime
    }
    let bufferDuration = playbackMetrics.bufferDuration
    let bufferedPosition: Double
    if duration.isFinite && duration > 0 {
      bufferedPosition = min(duration, currentTime + bufferDuration)
    } else {
      bufferedPosition = currentTime + bufferDuration
    }
    let nativeRate = playbackMetrics.rate
    let isPlaying = observedPlayingNow()
    let rate = isPlaying ? nativeRate : 0
    let isBuffering = isBuffering
    let isVisualReady = readyToDisplay
    let error = lastError.map { Variant_NullType_PlaybackError.second($0) }
    let errorFingerprint = playbackErrorFingerprint(error)
    return PlaybackSnapshot(
      status: status,
      currentTime: currentTime,
      duration: duration,
      bufferDuration: bufferDuration,
      bufferedPosition: bufferedPosition,
      rate: rate,
      isPlaying: isPlaying,
      isBuffering: isBuffering,
      isVisualReady: isVisualReady,
      error: error,
      nativeTimestampMs: Date().timeIntervalSince1970 * 1000,
      fingerprint: PlaybackStateFingerprint(
        status: playbackStatusIndex(currentStatus),
        currentTime: currentTime,
        duration: duration,
        bufferDuration: bufferDuration,
        bufferedPosition: bufferedPosition,
        rate: rate,
        isPlaying: isPlaying,
        isBuffering: isBuffering,
        isVisualReady: isVisualReady,
        errorCode: errorFingerprint.code,
        errorMessageHash: errorFingerprint.messageHash
      )
    )
  }

  private func playbackState(from snapshot: PlaybackSnapshot) -> PlaybackState {
    PlaybackState(
      status: snapshot.status,
      currentTime: snapshot.currentTime,
      duration: snapshot.duration,
      bufferDuration: snapshot.bufferDuration,
      bufferedPosition: snapshot.bufferedPosition,
      rate: snapshot.rate,
      isPlaying: snapshot.isPlaying,
      isBuffering: snapshot.isBuffering,
      isVisualReady: snapshot.isVisualReady,
      error: snapshot.error,
      nativeTimestampMs: snapshot.nativeTimestampMs
    )
  }

  var memorySnapshot: MemorySnapshot {
    mainThreadExecutor.run {
      if isReleased {
        return MemorySnapshot(
          playerBytes: 0,
          sourceBytes: 0,
          totalBytes: 0,
          preloadLevel: resolvedPreloadLevel(),
          retentionState: currentRetentionState(),
          isAttachedToView: false,
          isPlaying: false,
          wantsToPlay: false,
          isRingSlot: false,
          isPinnedForResourcePressure: false
        )
      }

      let playerBytes = playerItem == nil ? 0 : max(playbackMetrics.bufferDuration * 256_000, 64_000)
      let sourceBytes = hasActiveSource ? Double(currentHybridSource()?.memorySize ?? 0) : 0
      let retention = retentionSnapshot()

      return MemorySnapshot(
        playerBytes: playerBytes,
        sourceBytes: sourceBytes,
        totalBytes: playerBytes + sourceBytes,
        preloadLevel: resolvedPreloadLevel(),
        retentionState: currentRetentionState(),
        isAttachedToView: isAttachedToVideoView,
        isPlaying: isPlaying,
        wantsToPlay: wantsToPlay,
        isRingSlot: isRingSlot,
        isPinnedForResourcePressure: PlayerRetentionCoordinator.isPinnedForResourcePressure(retention)
      )
    }
  }

  func emitPlaybackState() {
    guard lifecycleGate.shouldEmit() else { return }
    let snapshot = currentPlaybackSnapshot()
    // The 0.25s observer tick rebuilds the state every time, but when nothing
    // meaningful changed (only the timestamp advanced) there is no reason to
    // cross the bridge. nativeTimestampMs is excluded from the fingerprint.
    if !playbackStateEmissionGate.shouldEmit(fingerprint: snapshot.fingerprint) {
      return
    }
    _eventEmitter?.onPlaybackState(playbackState(from: snapshot))
  }

  private func sanitizedDuration(_ value: Double) -> Double {
    value.isFinite && value >= 0 ? value : Double.nan
  }

  private func clampedPlaybackTime(_ value: Double) -> Double {
    let finiteValue = value.isFinite ? value : 0
    let positiveValue = max(0, finiteValue)
    let duration = playbackMetrics.duration
    guard duration.isFinite && duration > 0 else { return positiveValue }
    return min(positiveValue, duration)
  }

  private func isAtPlaybackEnd() -> Bool {
    let duration = playbackMetrics.duration
    guard duration.isFinite && duration > 0 else { return false }
    return playbackMetrics.currentTime >= duration - 0.05
  }

  private func playbackStatusIndex(_ status: NitroPlayerStatus) -> Int {
    switch status {
    case .idle:
      return 0
    case .loading:
      return 1
    case .buffering:
      return 2
    case .playing:
      return 3
    case .paused:
      return 4
    case .ended:
      return 5
    case .error:
      return 6
    }
  }

  private func playbackErrorFingerprint(_ error: Variant_NullType_PlaybackError?) -> (code: Int?, messageHash: UInt64?) {
    switch error {
    case .some(.second(let error)):
      return (playbackErrorCodeIndex(error.code), stableHash(error.message))
    case .some(.first):
      return (-1, nil)
    case .none:
      return (nil, nil)
    }
  }

  private func playbackErrorCodeIndex(_ code: NitroPlayerErrorCode) -> Int {
    switch code {
    case .libraryDeallocated:
      return 0
    case .libraryApplicationContextNotFound:
      return 1
    case .libraryMethodNotSupported:
      return 2
    case .playerReleased:
      return 3
    case .playerNotInitialized:
      return 4
    case .playerAssetNotInitialized:
      return 5
    case .playerInvalidSource:
      return 6
    case .playerInvalidTrackUrl:
      return 7
    case .playerCancelled:
      return 8
    case .sourceInvalidUri:
      return 9
    case .sourceMissingReadFilePermission:
      return 10
    case .sourceFileDoesNotExist:
      return 11
    case .sourceFailedToInitializeAsset:
      return 12
    case .sourceUnsupportedContentType:
      return 13
    case .sourceCancelled:
      return 14
    case .viewNotFound:
      return 15
    case .viewDeallocated:
      return 16
    case .viewPictureInPictureNotSupported:
      return 17
    case .unknownUnknown:
      return 18
    }
  }

  private func stableHash(_ value: String) -> UInt64 {
    var hash: UInt64 = 14_695_981_039_346_656_037
    for byte in value.utf8 {
      hash ^= UInt64(byte)
      hash &*= 1_099_511_628_211
    }
    return hash
  }

  func currentSourceConfig() -> NativeNitroPlayerConfig? {
    currentHybridSource()?.config
  }

  func resolvedInitialization() -> NitroSourceStartup {
    currentSourceConfig()?.startup ?? .eager
  }

  func resetPlaybackError() {
    lastError = nil
  }

  var cachedTimeControlStatus: AVPlayer.TimeControlStatus {
    playbackMetrics.timeControlStatus
  }

  func resetPlaybackMetrics(currentTime: Double = 0, duration: Double = Double.nan) {
    hasObservedClockProgress = false
    playbackMetrics.currentTime = max(0, currentTime.isFinite ? currentTime : 0)
    playbackMetrics.duration = sanitizedDuration(duration)
    playbackMetrics.bufferDuration = 0
    playbackMetrics.rate = 0
    playbackMetrics.timeControlStatus = .paused
    // KVO is change-only: if the player keeps its current rate/timeControlStatus
    // after this fabricated reset, no delivery would ever correct the cache. The
    // resync re-registers those observers with .initial so truth is re-seeded now.
    playerObserver?.resyncPlayerStateObservers()
  }

  func updateCachedProgress(currentTime: Double? = nil, bufferDuration: Double? = nil) {
    if let currentTime {
      playbackMetrics.currentTime = clampedPlaybackTime(currentTime)
      resumePositionSeconds = playbackMetrics.currentTime
    }
    if let bufferDuration {
      playbackMetrics.bufferDuration = max(0, bufferDuration.isFinite ? bufferDuration : 0)
    }
  }

  func observePlaybackProgress(currentTime: Double, bufferDuration: Double) {
    let previousCurrentTime = playbackMetrics.currentTime
    updateCachedProgress(currentTime: currentTime, bufferDuration: bufferDuration)
    let clockAdvanced = PlaybackWatchdogPolicy.hasClockAdvanced(
      startSeconds: previousCurrentTime,
      currentSeconds: playbackMetrics.currentTime,
      loopWrapped: false
    )
    guard PlaybackWatchdogPolicy.isObservedPlaying(
      clockAdvanced: clockAdvanced,
      nativeRate: playbackMetrics.rate,
      wantsToPlay: wantsToPlay
    ) else {
      return
    }

    hasObservedClockProgress = true
    status = .playing
    isCurrentlyBuffering = false
    resetPlaybackError()
  }

  func resetObservedPlaybackProgress() {
    hasObservedClockProgress = false
  }

  func updateCachedDuration(_ duration: Double) {
    playbackMetrics.duration = sanitizedDuration(duration)
    playbackMetrics.currentTime = clampedPlaybackTime(playbackMetrics.currentTime)
  }

  func updateCachedRate(_ rate: Float) {
    updateCachedRate(Double(rate))
  }

  func updateCachedRate(_ rate: Double) {
    let normalizedRate = rate.isFinite ? rate : 0
    playbackMetrics.rate = normalizedRate
  }

  func updateCachedTimeControlStatus(_ status: AVPlayer.TimeControlStatus) {
    playbackMetrics.timeControlStatus = status
  }

  func setPlaybackError(code: NitroPlayerErrorCode, message: String) {
    lastError = PlaybackError(code: code, message: message)
  }

  func beginSourceGeneration() {
    lifecycleGate.beginGeneration()
    resetBoundErrorRecovery()
    startupRecoveryAttempts = 0
    hasLoadedCurrentSource = false
    playbackStateEmissionGate.reset()
    resetPlaybackMetrics(currentTime: 0)
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    playbackWatchdogAttempts = 0
    playbackWatchdogEscalatedGeneration = nil
    playbackWatchdogIsCoolingDown = false
    playbackWatchdogCooldownCycles = 0
    renderFailureAudioSessionRecoveryGeneration = nil
  }

  func beginSourceCommand(allowAutoPlay: Bool) -> SourceCommand? {
    mainThreadExecutor.run {
      guard !isReleased else { return nil }

      let shouldAutoPlay = allowAutoPlay && wantsToPlay
      let oldSource = currentHybridSource()

      wantsToPlay = false
      playbackAudioSessionBinding.pause()
      cancelPendingTrim()
      cancelPreparationTask()
      beginSourceGeneration()

      return SourceCommand(
        generation: sourceGeneration,
        oldSource: oldSource,
        shouldAutoPlay: shouldAutoPlay
      )
    }
  }

  func markCurrentSourceLoaded() {
    hasLoadedCurrentSource = true
    startupRecoveryAttempts = 0
    cancelStartupRecovery()
  }

  func cancelStartupRecovery() {
    startupRecoveryToken &+= 1
    startupRecoveryTask?.cancel()
    startupRecoveryTask = nil
  }

  private func resetBoundErrorRecovery() {
    pendingBoundErrorRecoveryWorkItem?.cancel()
    pendingBoundErrorRecoveryWorkItem = nil
    boundErrorRecoveryAttempts = 0
  }

  private func nextBoundErrorRecoveryDelay() -> DispatchTimeInterval {
    switch boundErrorRecoveryAttempts {
    case 0:
      return .milliseconds(250)
    case 1:
      return .milliseconds(1_000)
    case 2:
      return .milliseconds(3_000)
    case 3:
      return .milliseconds(8_000)
    default:
      return .milliseconds(15_000)
    }
  }

  private func scheduleBoundErrorRecovery() {
    guard !isReleased, hasActiveSource else { return }
    guard playbackBinding?.snapshot().desiredPlayback == true else { return }
    guard pendingBoundErrorRecoveryWorkItem == nil else { return }

    let generation = sourceGeneration
    let delay = nextBoundErrorRecoveryDelay()
    let workItem = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.pendingBoundErrorRecoveryWorkItem = nil
      guard !self.isReleased,
        self.hasActiveSource,
        self.sourceGeneration == generation,
        self.playbackBinding?.snapshot().desiredPlayback == true else {
        self.resetBoundErrorRecovery()
        return
      }

      self.playbackBinding?.requestPlay()
    }
    boundErrorRecoveryAttempts += 1
    pendingBoundErrorRecoveryWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
  }

  func cancelPlaybackWatchdog() {
    playbackWatchdogToken &+= 1
    playbackWatchdogTask?.cancel()
    playbackWatchdogTask = nil
  }

  var playbackWatchdogAttemptCount: Int {
    playbackWatchdogAttempts
  }

  var hasPendingPlaybackWatchdog: Bool {
    playbackWatchdogTask != nil
  }

  internal func isPlaybackPreparationTicketCurrent(_ ticket: PlaybackPreparationTicket) -> Bool {
    switch ticket {
    case .watchdog(let token):
      return playbackWatchdogToken == token
    case .startup(let token):
      return startupRecoveryToken == token
    case .direct(let token):
      return preparationTaskToken == token
    }
  }

  func cancelPreparationTask() {
    preparationTaskToken &+= 1
    preparationTask?.cancel()
    preparationTask = nil
  }

  func beginPreparationTask() -> UInt64 {
    cancelPreparationTask()
    preparationTaskToken &+= 1
    return preparationTaskToken
  }

  /// Primes the render pipeline of a paused, buffered ring slot so the first play() flips
  /// the rate in tens of milliseconds instead of paying the cold decode ramp at reveal time.
  func prerollWarmPipelineIfNeeded() {
    guard isRingSlot,
          !isReleased,
          !wantsToPlay,
          !hasPrerolledCurrentItem,
          player.rate == 0,
          player.status == .readyToPlay,
          let expectedItem = playerItem,
          expectedItem.status == .readyToPlay,
          player.isMuted || player.volume == 0 else {
      return
    }

    hasPrerolledCurrentItem = true
    let expectedPlayer = player
    expectedPlayer.preroll(atRate: desiredPlaybackRate) { [weak self] finished in
      guard !finished else { return }
      DispatchQueue.main.async { [weak self] in
        guard let self,
              !self.isReleased,
              self.player === expectedPlayer,
              self.playerItem === expectedItem,
              expectedPlayer.currentItem === expectedItem else { return }
        // Cancelled preroll (rate change or interruption): drop the latch so a later
        // readiness event can retry; playback that already started does not need it.
        self.hasPrerolledCurrentItem = false
      }
    }
  }

  func startCurrentItemPlayback() {
    guard playerItem != nil else { return }
    preparePlaybackAudioSessionBinding()
    if !isPlaying {
      hasObservedClockProgress = false
    }
    if #available(iOS 16.0, tvOS 16.0, *) {
      player.defaultRate = desiredPlaybackRate
    }
    player.playImmediately(atRate: desiredPlaybackRate)
    if player.rate == 0 {
      player.rate = desiredPlaybackRate
    }
  }

  private func applyLoopMode() {
    player.actionAtItemEnd = loop ? .none : .pause
  }

  func recreatePlayerForRecovery() {
    let oldPlayer = player
    let nextPlayer = AVPlayer()
    hasObservedClockProgress = false
    hasPrerolledCurrentItem = false
    nextPlayer.automaticallyWaitsToMinimizeStalling = false
    nextPlayer.isMuted = oldPlayer.isMuted
    nextPlayer.volume = oldPlayer.volume
    nextPlayer.preventsDisplaySleepDuringVideoPlayback = oldPlayer.preventsDisplaySleepDuringVideoPlayback
    if #available(iOS 16.0, tvOS 16.0, *) {
      nextPlayer.defaultRate = desiredPlaybackRate
    }

    oldPlayer.pause()
    oldPlayer.replaceCurrentItem(with: nil)
    player = nextPlayer
    NitroPlayerManager.shared.rebindViews(for: self)
  }

  func recoverAfterMediaServicesReset() {
    restartCurrentItemPreservingPosition()
  }

  private func restartCurrentItemPreservingPosition() {
    precondition(Thread.isMainThread)
    guard !isReleased, hasActiveSource else { return }

    let currentPosition = currentTime
    if currentPosition.isFinite, currentPosition >= 0 {
      resumePositionSeconds = currentPosition
    }
    let shouldResume = wantsToPlay

    playbackAudioSessionBinding.release()
    cancelPendingTrim()
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    cancelPreparationTask()
    sourceLoader.cancelDetached()
    beginSourceGeneration()

    player.pause()
    playerItem = nil
    replaceCurrentItem(nil)
    recreatePlayerForRecovery()

    readyToDisplay = false
    isCurrentlyBuffering = false
    resetPlaybackError()
    status = shouldResume ? .loading : .paused
    emitPlaybackState()

    guard shouldResume else { return }

    do {
      try play()
    } catch {
      failPlayback(message: error.localizedDescription)
    }
  }

  private func refreshSourceAssetForPlaybackRestart(source: HybridNitroPlayerSource) {
    if source.refreshPlaybackRoute() {
      return
    }
    source.releaseAsset()
  }

  func performSeamlessLoopSeek() {
    guard !isReleased,
          hasActiveSource,
          let expectedPlayerItem = playerItem else {
      return
    }
    let expectedPlayer = player
    guard expectedPlayer.currentItem === expectedPlayerItem else { return }
    let expectedSourceGeneration = sourceGeneration
    seekToken &+= 1
    let expectedSeekToken = seekToken

    loopWrapCount += 1
    updateCachedProgress(currentTime: 0)
    emitPlaybackState()

    expectedPlayer.seek(
      to: .zero,
      toleranceBefore: .zero,
      toleranceAfter: .zero
    ) { [weak self] _ in
      guard let self else { return }
      // AVPlayer seek completions arrive on an AVFoundation-internal queue: a sync
      // bridge here would block that queue on main and widen a main-thread stall.
      self.mainThreadExecutor.runAsync {
        guard !self.isReleased,
              self.wantsToPlay,
              self.sourceGeneration == expectedSourceGeneration,
              self.player === expectedPlayer,
              self.playerItem === expectedPlayerItem,
              expectedPlayer.currentItem === expectedPlayerItem,
              self.seekToken == expectedSeekToken else {
          return
        }
        if self.playbackMetrics.rate == 0 {
          self.startCurrentItemPlayback()
        }
        self.updateCachedProgress(currentTime: 0)
        self.emitPlaybackState()
    }
  }
  }

  // Arm the playback watchdog. Idempotent (no-op if already armed). Timing is dynamic:
  // 12s for cold-start/post-rearm, 3s after observed clock progress, 15s during cooldown.
  // It verifies player advancement since this window's baseline; on healthy
  // (advanced / looped / near end) it resets the
  // attempt counter and RE-ARMS to keep watching the whole playback, so a freeze AFTER initial progress
  // is still caught. Buffer growth is not playback liveness, so a loaded source without clock progress
  // consumes the bounded recovery budget.
  func schedulePlaybackStartWatchdog() {
    guard !isReleased, hasActiveSource, wantsToPlay else { return }
    guard playbackWatchdogTask == nil else { return }

    let generation = sourceGeneration
    let startPositionSeconds = currentTime
    let startLoopWrapCount = loopWrapCount
    let isWindowCoolingDown = playbackWatchdogIsCoolingDown
    let isWindowObserved = hasObservedClockProgress
    let windowDelayNs = PlaybackWatchdogPolicy.playbackWatchdogWindowDelayNs(
      hasObservedClockProgress: isWindowObserved,
      isCoolingDown: isWindowCoolingDown
    )
    playbackWatchdogToken &+= 1
    let capturedToken = playbackWatchdogToken
    playbackWatchdogTask = Task.detached(priority: .userInitiated) { [weak self] in
      do {
        try await Task.sleep(nanoseconds: windowDelayNs)
      } catch {
        return
      }

      guard let self else { return }
      let shouldDeliverCallback = self.mainThreadExecutor.run {
        self.isPlaybackPreparationTicketCurrent(.watchdog(capturedToken))
      }
      guard shouldDeliverCallback else { return }

      DispatchQueue.main.async { [weak self] in
        guard let self, self.isPlaybackPreparationTicketCurrent(.watchdog(capturedToken)) else { return }
        self.playbackWatchdogTask = nil
        let cooldownElapsed = isWindowCoolingDown
        guard !self.isReleased, self.hasActiveSource, self.wantsToPlay, self.sourceGeneration == generation else {
          return
        }

        let decision = PlaybackWatchdogPolicy.evaluate(
          startSeconds: startPositionSeconds,
          currentSeconds: self.currentTime,
          durationSeconds: self.duration,
          loop: self.loop,
          loopWrapped: self.loopWrapCount != startLoopWrapCount,
          hasLoadedCurrentSource: self.hasLoadedCurrentSource,
          attempts: self.playbackWatchdogAttempts,
          maxAttempts: self.maxPlaybackWatchdogAttempts,
          escalationUsed: self.playbackWatchdogEscalatedGeneration == generation,
          cooldownElapsed: cooldownElapsed,
          requiresVisualReadiness: self.playbackRequiresView && self.isAttachedToVideoView,
          visuallyReady: self.readyToDisplay,
          cooldownCycles: self.playbackWatchdogCooldownCycles,
          maxCooldownCycles: 2
        )
        self.playbackWatchdogAttempts = decision.attempts
        switch decision.action {
        case .resetAndRearm:
          self.playbackWatchdogIsCoolingDown = false
          self.playbackWatchdogCooldownCycles = 0
          self.hasObservedClockProgress = true
          self.schedulePlaybackStartWatchdog()
          return
        case .escalateSource:
          self.playbackWatchdogIsCoolingDown = false
          self.escalatePlaybackWatchdog(generation: generation)
          return
        case .enterCooldown:
          self.playbackWatchdogIsCoolingDown = true
          self.playbackWatchdogCooldownCycles += 1
          self.schedulePlaybackStartWatchdog()
          return
        case .terminate:
          self.failPlayback(message: "watchdog terminal")
          return
        case .rearm:
          self.playbackWatchdogIsCoolingDown = false
          self.schedulePlaybackStartWatchdog()
          return
        case .recoverStalledPlayback:
          self.playbackWatchdogIsCoolingDown = false
          break
        }

        // Loaded + wantsToPlay + no time progress is a stall even when AVPlayer reports
        // waitingToPlayAtSpecifiedRate. Keeping that state on the watch loop strands the
        // feed on the first frame with no error, so recover the loaded item directly.
        if self.hasLoadedCurrentSource {
          self.recoverStalledPlayback(generation: generation)
        } else {
          self.schedulePlaybackStartWatchdog()
        }
      }
    }
  }

  private func purgeCurrentHlsSourceCache() {
    currentHybridSource()?.purgePlaybackCache()
  }

  private func escalatePlaybackWatchdog(generation: Int) {
    guard playbackWatchdogEscalatedGeneration != generation else {
      playbackWatchdogAttempts = maxPlaybackWatchdogAttempts
      playbackWatchdogIsCoolingDown = true
      schedulePlaybackStartWatchdog()
      return
    }
    cancelPlaybackWatchdog()
    playbackWatchdogEscalatedGeneration = generation
    playbackWatchdogAttempts = 0
    playbackWatchdogIsCoolingDown = false
    hasObservedClockProgress = false
    isCurrentlyBuffering = false
    readyToDisplay = false
    status = .loading
    emitPlaybackState()

    guard let source = currentHybridSource() else {
      failPlayback(message: "Playback watchdog recovery requires an active source.")
      return
    }
    cancelPreparationTask()
    NativeAudioSessionRuntime.shared.recoverSessionAfterRenderFailure()
    let capturedGeneration = sourceGeneration
    playbackWatchdogToken &+= 1
    let capturedToken = playbackWatchdogToken

    playbackWatchdogTask = Task.detached(priority: .userInitiated) { [weak self] in
      guard let self else { return }
      let shouldRecover = self.mainThreadExecutor.run { [weak self] in
        guard let self else { return false }
        guard self.isPlaybackPreparationTicketCurrent(.watchdog(capturedToken)) else { return false }
        guard !self.isReleased,
              self.hasActiveSource,
              self.wantsToPlay,
              self.sourceGeneration == capturedGeneration,
              let currentSource = self.currentHybridSource(),
              (source as AnyObject) === (currentSource as AnyObject) else {
          self.playbackWatchdogTask = nil
          return false
        }
        return true
      }
      guard shouldRecover else {
        return
      }

      let shouldRefreshSource = self.mainThreadExecutor.run {
        self.isPlaybackPreparationTicketCurrent(.watchdog(capturedToken))
      }
      guard shouldRefreshSource else { return }
      source.purgePlaybackCache()
      if !source.refreshPlaybackRoute() {
        source.trimToCold()
      }

      do {
        try await self.prepareBufferedState(
          recreatePlayer: true,
          expectedSource: source,
          expectedGeneration: capturedGeneration,
          expectedPlaybackPreparationTicket: .watchdog(capturedToken)
        )
        DispatchQueue.main.async { [weak self] in
          guard let self, self.isPlaybackPreparationTicketCurrent(.watchdog(capturedToken)) else { return }
          self.playbackWatchdogTask = nil
          guard !self.isReleased, self.sourceGeneration == capturedGeneration, self.wantsToPlay else { return }
          self.startCurrentItemPlayback()
          self.schedulePlaybackStartWatchdog()
        }
      } catch {
        DispatchQueue.main.async { [weak self] in
          guard let self, self.isPlaybackPreparationTicketCurrent(.watchdog(capturedToken)) else { return }
          self.playbackWatchdogTask = nil
          guard !self.isReleased, self.sourceGeneration == capturedGeneration, self.wantsToPlay else { return }
          self.schedulePlaybackStartWatchdog()
        }
      }
    }
  }

  private func recoverStalledPlayback(generation: Int) {
    cancelPlaybackWatchdog()
    hasObservedClockProgress = false
    playbackWatchdogIsCoolingDown = false
    isCurrentlyBuffering = false
    readyToDisplay = false
    status = .loading
    emitPlaybackState()

    guard let source = currentHybridSource() else {
      return
    }
    cancelPreparationTask()
    NativeAudioSessionRuntime.shared.recoverSessionAfterRenderFailure()
    let capturedGeneration = sourceGeneration
    playbackWatchdogToken &+= 1
    let capturedToken = playbackWatchdogToken

    playbackWatchdogTask = Task.detached(priority: .userInitiated) { [weak self] in
      guard let self else { return }
      let shouldRecover = self.mainThreadExecutor.run { [weak self] in
        guard let self else { return false }
        guard self.isPlaybackPreparationTicketCurrent(.watchdog(capturedToken)) else { return false }
        guard !self.isReleased,
              self.hasActiveSource,
              self.wantsToPlay,
              self.sourceGeneration == capturedGeneration,
              let currentSource = self.currentHybridSource(),
              (source as AnyObject) === (currentSource as AnyObject) else {
          self.playbackWatchdogTask = nil
          return false
        }
        return true
      }
      guard shouldRecover else {
        return
      }

      let shouldRefreshSource = self.mainThreadExecutor.run {
        self.isPlaybackPreparationTicketCurrent(.watchdog(capturedToken))
      }
      guard shouldRefreshSource else { return }
      // The HLS proxy is intentionally not restarted: it already serves this loaded source, and a
      // decode/render stall does not need a new route. prepareBufferedState rebuilds the AVPlayerItem
      // from the existing source; genuine route failures surface via the item-failed startup recovery.
      self.refreshSourceAssetForPlaybackRestart(source: source)

      do {
        try await self.prepareBufferedState(
          recreatePlayer: true,
          expectedSource: source,
          expectedGeneration: capturedGeneration,
          expectedPlaybackPreparationTicket: .watchdog(capturedToken)
        )
        DispatchQueue.main.async { [weak self] in
          guard let self, self.isPlaybackPreparationTicketCurrent(.watchdog(capturedToken)) else { return }
          self.playbackWatchdogTask = nil
          guard !self.isReleased, self.sourceGeneration == capturedGeneration, self.wantsToPlay else { return }
          self.startCurrentItemPlayback()
          self.schedulePlaybackStartWatchdog()
        }
      } catch {
        DispatchQueue.main.async { [weak self] in
          guard let self, self.isPlaybackPreparationTicketCurrent(.watchdog(capturedToken)) else { return }
          self.playbackWatchdogTask = nil
          guard !self.isReleased, self.sourceGeneration == capturedGeneration, self.wantsToPlay else { return }
          self.schedulePlaybackStartWatchdog()
        }
      }
    }
  }

  func currentHybridSource() -> HybridNitroPlayerSource? {
    sourceStorage as? HybridNitroPlayerSource
  }

  func shouldAttemptStartupRecovery() -> Bool {
    guard !isReleased else { return false }
    guard hasActiveSource, wantsToPlay, !hasLoadedCurrentSource else { return false }
    guard startupRecoveryAttempts < maxStartupRecoveryAttempts else { return false }
    return currentHybridSource()?.supportsStartupRecovery() == true
  }

  @discardableResult
  func attemptStartupRecoveryIfNeeded(message: String) -> Bool {
    guard shouldAttemptStartupRecovery() else {
      return false
    }

    startupRecoveryAttempts += 1
    let generation = sourceGeneration
    hasObservedClockProgress = false
    isCurrentlyBuffering = false
    readyToDisplay = false
    resetPlaybackError()
    status = .loading
    emitPlaybackState()

    guard let scheduledSource = currentHybridSource() else {
      return false
    }

    cancelPlaybackWatchdog()
    cancelStartupRecovery()
    startupRecoveryToken &+= 1
    let capturedToken = startupRecoveryToken
    let delayNs = startupRecoveryDelayNs
    startupRecoveryTask = Task.detached(priority: .userInitiated) { [weak self] in
      do {
        try await Task.sleep(nanoseconds: delayNs)
      } catch {
        return
      }

      guard let self else { return }
      let source = self.mainThreadExecutor.run { [weak self] () -> HybridNitroPlayerSource? in
        guard let self else { return nil }
        guard self.isPlaybackPreparationTicketCurrent(.startup(capturedToken)),
              !self.isReleased,
              self.hasActiveSource,
              self.wantsToPlay,
              self.sourceGeneration == generation,
              let currentSource = self.currentHybridSource(),
              (scheduledSource as AnyObject) === (currentSource as AnyObject) else {
          if self.isPlaybackPreparationTicketCurrent(.startup(capturedToken)) {
            self.startupRecoveryTask = nil
          }
          return nil
        }
        self.cancelPreparationTask()
        return scheduledSource
      }
      guard let source else { return }

      let shouldRefreshSource = self.mainThreadExecutor.run {
        self.isPlaybackPreparationTicketCurrent(.startup(capturedToken))
      }
      guard shouldRefreshSource else { return }
      source.refreshPlaybackRoute()

      do {
        try await self.prepareBufferedState(
          expectedSource: source,
          expectedGeneration: generation,
          expectedPlaybackPreparationTicket: .startup(capturedToken)
        )
        DispatchQueue.main.async { [weak self] in
          guard let self,
                self.isPlaybackPreparationTicketCurrent(.startup(capturedToken)) else { return }
          self.startupRecoveryTask = nil
          guard !self.isReleased,
                self.sourceGeneration == generation,
                self.wantsToPlay,
                let currentSource = self.currentHybridSource(),
                (source as AnyObject) === (currentSource as AnyObject) else { return }
          self.startCurrentItemPlayback()
        }
      } catch {
        DispatchQueue.main.async { [weak self] in
          guard let self,
                self.isPlaybackPreparationTicketCurrent(.startup(capturedToken)) else { return }
          self.startupRecoveryTask = nil
          if error is CancellationError {
            return
          }
          guard !self.isReleased,
                self.sourceGeneration == generation,
                self.wantsToPlay,
                let currentSource = self.currentHybridSource(),
                (source as AnyObject) === (currentSource as AnyObject) else { return }
          self.failPlayback(message: message.isEmpty ? error.localizedDescription : message)
        }
      }
    }

    return true
  }

  func failPlayback(message: String) {
    cancelPreparationTask()
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    purgeCurrentHlsSourceCache()
    wantsToPlay = false
    playbackAudioSessionBinding.pause()
    hasObservedClockProgress = false
    player.pause()
    updateCachedRate(0.0)
    status = .error
    isCurrentlyBuffering = false
    readyToDisplay = false
    setPlaybackError(code: .unknownUnknown, message: message)
    if let lastError {
      _eventEmitter?.onError(lastError)
    }
    emitPlaybackState()
    scheduleBoundErrorRecovery()
  }

  func recoverAudioSessionForRenderFailureIfNeeded(_ error: Error?) {
    guard renderFailureAudioSessionRecoveryGeneration != sourceGeneration else {
      return
    }

    var currentError = error as NSError?
    var isRenderFailure = false
    while let inspectedError = currentError {
      if inspectedError.domain == AVFoundationErrorDomain && inspectedError.code == -11800 {
        isRenderFailure = true
        break
      }
      currentError = inspectedError.userInfo[NSUnderlyingErrorKey] as? NSError
    }
    guard isRenderFailure else {
      return
    }

    renderFailureAudioSessionRecoveryGeneration = sourceGeneration
    NativeAudioSessionRuntime.shared.recoverSessionAfterRenderFailure()
  }

  func resolvePlayPauseStatus() -> NitroPlayerStatus {
    if PlaybackWatchdogPolicy.isObservedPlaying(
      clockAdvanced: hasObservedClockProgress,
      nativeRate: playbackMetrics.rate,
      wantsToPlay: wantsToPlay
    ) {
      return .playing
    }
    if wantsToPlay {
      switch status {
      case .buffering, .loading:
        return status
      default:
        return .loading
      }
    }
    return .paused
  }

  func play() throws {
    mainThreadExecutor.runAsync { [self] in
      guard !isReleased else { return }
      cancelPendingTrim()
      let wasPlayIntentActive = wantsToPlay
      wantsToPlay = true
      if !wasPlayIntentActive {
        playbackWatchdogAttempts = 0
        playbackWatchdogIsCoolingDown = false
        hasObservedClockProgress = false
      }
      if hasActiveSource {
        preparePlaybackAudioSessionBinding()
      }

      if status == .error || lastError != nil {
        playbackWatchdogAttempts = 0
        playbackWatchdogEscalatedGeneration = nil
        playbackWatchdogIsCoolingDown = false
        hasObservedClockProgress = false
        resetPlaybackError()
        recoverStalledPlayback(generation: sourceGeneration)
        return
      }

      guard hasActiveSource else {
        wantsToPlay = false
        playbackAudioSessionBinding.pause()
        status = .idle
        readyToDisplay = false
        isCurrentlyBuffering = false
        resetPlaybackError()
        emitPlaybackState()
        return
      }

      guard let activeSource = currentHybridSource() else {
        wantsToPlay = false
        playbackAudioSessionBinding.pause()
        status = .idle
        readyToDisplay = false
        isCurrentlyBuffering = false
        resetPlaybackError()
        emitPlaybackState()
        return
      }
      let generation = sourceGeneration

      schedulePlaybackStartWatchdog()

      if let expectedPlayerItem = playerItem {
        if status == .ended || isAtPlaybackEnd() {
          let expectedPlayer = player
          guard expectedPlayer.currentItem === expectedPlayerItem else { return }
          let expectedSourceGeneration = sourceGeneration
          seekToken &+= 1
          let expectedSeekToken = seekToken
          resumePositionSeconds = 0
          updateCachedProgress(currentTime: 0)
          status = .loading
          emitPlaybackState()
          expectedPlayer.seek(
            to: CMTime(seconds: 0, preferredTimescale: 1000),
            toleranceBefore: .zero,
            toleranceAfter: .zero
          ) { [weak self] _ in
            guard let self else { return }
            self.mainThreadExecutor.runAsync {
              guard !self.isReleased,
                    self.wantsToPlay,
                    self.sourceGeneration == expectedSourceGeneration,
                    self.player === expectedPlayer,
                    self.playerItem === expectedPlayerItem,
                    expectedPlayer.currentItem === expectedPlayerItem,
                    self.seekToken == expectedSeekToken else {
                return
              }
              self.startCurrentItemPlayback()
              self.emitPlaybackState()
            }
          }
          return
        }

        startCurrentItemPlayback()
        emitPlaybackState()
        return
      }

      status = .loading
      readyToDisplay = false
      resetPlaybackError()
      emitPlaybackState()

      let capturedToken = beginPreparationTask()
      preparationTask = Task.detached(priority: .userInitiated) { [weak self] in
        guard let self else { return }

        do {
          try await self.prepareBufferedState(
            expectedSource: activeSource,
            expectedGeneration: generation,
            expectedPlaybackPreparationTicket: .direct(capturedToken)
          )
          DispatchQueue.main.async { [weak self] in
            guard let self,
                  self.isPlaybackPreparationTicketCurrent(.direct(capturedToken)),
                  !self.isReleased,
                  self.sourceGeneration == generation,
                  self.wantsToPlay,
                  let currentSource = self.currentHybridSource(),
                  (activeSource as AnyObject) === (currentSource as AnyObject) else { return }
            self.preparationTask = nil
            self.startCurrentItemPlayback()
          }
        } catch {
          DispatchQueue.main.async { [weak self] in
            guard let self,
                  self.isPlaybackPreparationTicketCurrent(.direct(capturedToken)),
                  !self.isReleased,
                  self.sourceGeneration == generation,
                  self.wantsToPlay,
                  let currentSource = self.currentHybridSource(),
                  (activeSource as AnyObject) === (currentSource as AnyObject) else { return }
            self.preparationTask = nil
            if error is CancellationError {
              guard self.playerItem == nil else { return }
              DispatchQueue.main.async { [weak self] in
                guard let self,
                      self.isPlaybackPreparationTicketCurrent(.direct(capturedToken)),
                      !self.isReleased,
                      self.sourceGeneration == generation,
                      self.wantsToPlay,
                      self.playerItem == nil,
                      self.preparationTask == nil,
                      let currentSource = self.currentHybridSource(),
                      (activeSource as AnyObject) === (currentSource as AnyObject) else { return }
                try? self.play()
              }
              return
            }
            if self.attemptStartupRecoveryIfNeeded(message: error.localizedDescription) {
              return
            }
            self.failPlayback(message: error.localizedDescription)
          }
        }
      }
    }
  }

  /// True when the resolved route no longer matches the current transport.
  var hasStaleRoute: Bool {
    currentHybridSource()?.isRouteStale == true
  }

  /// Re-resolves the playback route when it no longer matches the current transport, then
  /// restarts the item so the new route actually takes effect. A refreshed route that is not
  /// restarted would keep playing the stale one.
  func refreshPlaybackRouteIfStale() {
    precondition(Thread.isMainThread)
    guard !isReleased, hasActiveSource, let source = currentHybridSource() else {
      return
    }
    guard source.isRouteStale else {
      return
    }
    source.refreshPlaybackRoute()
    restartCurrentItemPreservingPosition()
  }

  /// A foreground transition opens a new lifecycle epoch. Recovery budgets spent while the
  /// process was suspended must not disable recovery for the rest of the process lifetime.
  func resetRecoveryBudgetsForNewLifecycleEpoch() {
    precondition(Thread.isMainThread)
    guard !isReleased else {
      return
    }
    startupRecoveryAttempts = 0
    playbackWatchdogAttempts = 0
    playbackWatchdogIsCoolingDown = false
    playbackWatchdogCooldownCycles = 0
    playbackWatchdogEscalatedGeneration = nil
  }

  private func pauseTransport(clearPlayIntent: Bool) {
    if clearPlayIntent {
      wantsToPlay = false
    }
    cancelPreparationTask()
    cancelStartupRecovery()
    cancelPlaybackWatchdog()
    hasObservedClockProgress = false
    playbackAudioSessionBinding.pause()
    player.pause()
    updateCachedRate(0.0)

    if status != .ended && status != .idle {
      status = .paused
      isCurrentlyBuffering = false
      emitPlaybackState()
    }

    if !isAttachedToVideoView {
      scheduleOffscreenTrim()
    }
  }

  func pause() throws {
    mainThreadExecutor.runAsync { [self] in
      guard !isReleased else { return }
      pauseTransport(clearPlayIntent: true)
    }
  }

  func configurePlayback(key: String, group: String, priority: Double, resumeAutomatically: Bool, requiresView: Bool) throws {
    guard !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw NSError(domain: "NitroPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Playback key must not be blank"])
    }
    guard !group.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw NSError(domain: "NitroPlayer", code: 2, userInfo: [NSLocalizedDescriptionKey: "Playback group must not be blank"])
    }
    guard priority.isFinite,
      priority.rounded(.towardZero) == priority,
      priority >= Double(Int32.min),
      priority <= Double(Int32.max) else {
      throw NSError(domain: "NitroPlayer", code: 3, userInfo: [NSLocalizedDescriptionKey: "Playback priority must be a signed 32-bit integer"])
    }

    mainThreadExecutor.runAsync { [self] in
      guard !isReleased else { return }
      playbackRequiresView = requiresView
      if playbackBinding == nil {
        playbackBinding = PlaybackSessionBinding(
          coordinator: PlaybackSessionRuntime.shared.coordinator,
          play: { [weak self] in
            guard let self else { return }
            do {
              try self.play()
            } catch {
              self.failPlayback(message: error.localizedDescription)
            }
          },
          pause: { [weak self] in try? self?.pause() },
          idle: { [weak self] in self?._eventEmitter?.onPlaybackIntentIdled() }
        )
      }
      playbackBinding?.configure(
        key: key,
        policy: PlaybackSessionPolicy(
          group: group,
          priority: Int(priority),
          resume: resumeAutomatically ? .automatic : .manual
        )
      )
      playbackBinding?.updateEligibility(eligible: PlaybackEligibility.resolve(active: playbackActive, visible: playbackVisible, attached: isAttachedToVideoView, requiresView: playbackRequiresView))
    }
  }

  func updatePlayback(active: Bool, visible: Bool, muted: Bool, loop: Bool) throws {
    mainThreadExecutor.runAsync { [self] in
      guard !isReleased else { return }
      self.muted = muted
      self.loop = loop
      playbackActive = active
      playbackVisible = visible
      playbackBinding?.updateEligibility(eligible: PlaybackEligibility.resolve(active: playbackActive, visible: playbackVisible, attached: isAttachedToVideoView, requiresView: playbackRequiresView))
    }
  }

  /// True when the binding declares playback but the player is not playing - the intent was
  /// declared and never delivered.
  var hasUnsatisfiedPlaybackIntent: Bool {
    guard !isReleased, hasActiveSource else {
      return false
    }
    guard playbackBinding?.snapshot().desiredPlayback == true else {
      return false
    }
    return !isPlaying
  }

  /// Re-delivers the intent already declared by the playback binding after a foreground
  /// transition.
  ///
  /// Lifecycle handlers skip bound players because the arbiter owns their intent, but nothing
  /// re-delivers that intent when the process returns to the foreground: the player stays idle
  /// while its binding still declares playback. Re-asserting keeps the arbiter authoritative -
  /// a binding that wants idle stays idle.
  func reassertPlaybackIntentAfterForeground() {
    precondition(Thread.isMainThread)
    guard hasUnsatisfiedPlaybackIntent else {
      return
    }
    playbackBinding?.requestPlay()
  }

  func requestPlayback() throws {
    mainThreadExecutor.runAsync { [self] in
      playbackBinding?.requestPlay()
    }
  }

  func requestIdle() throws {
    mainThreadExecutor.runAsync { [self] in
      resetBoundErrorRecovery()
      playbackBinding?.requestIdle()
    }
  }

  func clearPlayback() throws {
    mainThreadExecutor.runAsync { [self] in
      resetBoundErrorRecovery()
      playbackBinding?.release()
      playbackBinding = nil
      playbackActive = false
      playbackVisible = false
      playbackRequiresView = true
    }
  }

  // App-state pause must preserve wantsToPlay so the foreground policy can resume it.
  func lifecyclePause() {
    mainThreadExecutor.run {
      guard !isReleased else { return }
      pauseTransport(clearPlayIntent: false)
    }
  }

  func seekBy(time: Double) throws {
    mainThreadExecutor.runAsync { [self] in
      guard !isReleased, playerItem != nil else { return }

      // Duration is NaN for live streams
      let fixedDuration = playbackMetrics.duration.isNaN ? Double.infinity : playbackMetrics.duration

      // Clap by <0, duration>
      let newTime = max(0, min(playbackMetrics.currentTime + time, fixedDuration))

      currentTime = newTime
    }
  }

  func seekTo(time: Double) {
    mainThreadExecutor.runAsync { [self] in
      currentTime = time
    }
  }

  func notifyViewAttached(view: NitroPlayerComponentView) {
    mainThreadExecutor.run {
      guard attachedVideoViewIds.insert(ObjectIdentifier(view)).inserted else { return }
      playbackBinding?.updateEligibility(eligible: PlaybackEligibility.resolve(active: playbackActive, visible: playbackVisible, attached: isAttachedToVideoView, requiresView: playbackRequiresView))
      cancelPendingTrim()
    }
  }

  func notifyViewDetached(view: NitroPlayerComponentView) {
    mainThreadExecutor.run {
      guard attachedVideoViewIds.remove(ObjectIdentifier(view)) != nil else { return }
      playbackBinding?.updateEligibility(eligible: PlaybackEligibility.resolve(active: playbackActive, visible: playbackVisible, attached: isAttachedToVideoView, requiresView: playbackRequiresView))

      if isAttachedToVideoView {
        return
      }

      scheduleOffscreenTrim()
    }
  }

  func clearAttachedVideoViews() {
    mainThreadExecutor.run {
      attachedVideoViewIds.removeAll()
    }
  }

  // MARK: - Memory Management

  func dispose() {
    release()
  }

  var memorySize: Int {
    cachedItemMemoryBytesLock.lock()
    defer { cachedItemMemoryBytesLock.unlock() }
    return cachedItemMemoryBytes
  }

  var nativePlaybackAudioPolicy: NativePlaybackAudioPolicy {
    let mix: NativeAudioMixPolicy
    switch mixAudioMode {
    case .auto:
      mix = .auto
    case .mixwithothers:
      mix = .mixWithOthers
    case .donotmix:
      mix = .doNotMix
    case .duckothers:
      mix = .duckOthers
    }

    let silent: NativeAudioSilentPolicy
    switch ignoreSilentSwitchMode {
    case .auto:
      silent = .auto
    case .ignore:
      silent = .ignore
    case .obey:
      silent = .obey
    }

    return NativePlaybackAudioPolicy(mix: mix, silent: silent)
  }

  var isPlaybackAudioAudible: Bool {
    !player.isMuted && player.volume > 0
  }

  func preparePlaybackAudioSessionBinding() {
    playbackAudioSessionBinding.prepareToPlay(policy: nativePlaybackAudioPolicy)
  }

  func applyPlaybackAudioSessionPolicy() {
    playbackAudioSessionBinding.updatePolicy(nativePlaybackAudioPolicy)
  }
}
