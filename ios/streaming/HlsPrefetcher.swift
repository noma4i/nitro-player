import Foundation

final class HlsPrefetcher: NSObject, KTVHCDataHLSLoaderDelegate {
  static let shared = HlsPrefetcher()
  static let defaultDurationSeconds = 2.0

  private static let dedupWindowSeconds = 60.0
  private static let maxDedupEntries = 500
  private static let timeoutSeconds = 30.0

  private let queue = DispatchQueue(label: "com.nitroplay.hls.prefetch")
  private let lock = NSLock()
  private let settledListeners = ListenerRegistry()
  private var dedupEntries: [String: DedupEntry] = [:]
  private var activePrefetches: [ObjectIdentifier: ActivePrefetch] = [:]
  private var queuedPrefetches: [String: Int] = [:]
  private var pendingCancellations: Set<String> = []
  private var counters = Counters()

  private override init() {}

  func prefetch(url: String, headers: [String: String]?, durationSeconds: Double) {
    withLock {
      counters.requested += 1
    }
    guard HlsManifestUrl.matches(url) else {
      emitSettled(url)
      return
    }

    enqueuePrefetch(url: url, headers: headers, durationSeconds: durationSeconds, originalUrl: url)
  }

  func cancel(url: String, headers: [String: String]?) {
    let key = HlsRequestIdentity.cacheNamespace(url: url, headers: headers)
    let cancellation = withLock { () -> (queued: Bool, active: [ActivePrefetch]) in
      let hasQueued = (queuedPrefetches[key] ?? 0) > 0
      if hasQueued {
        pendingCancellations.insert(key)
      }
      let matching = activePrefetches.filter { $0.value.dedupKey == key }
      matching.keys.forEach { activePrefetches.removeValue(forKey: $0) }
      dedupEntries.removeValue(forKey: key)
      if hasQueued || !matching.isEmpty {
        counters.cancelled += 1
      }
      return (hasQueued, Array(matching.values))
    }
    cancellation.active.forEach { context in
      context.timeoutWorkItem.cancel()
      context.loader.close()
      emitSettled(context.originalUrl)
    }
    if cancellation.queued {
      emitSettled(url)
    }
  }

  func addOnSettledListener(listener: @escaping (String) -> Void) -> ListenerSubscription {
    settledListeners.add(event: "prefetchSettled", listener: listener)
  }

  func forget(_ key: String) {
    _ = withLock {
      dedupEntries.removeValue(forKey: key)
    }
  }

  func debugSnapshot() -> [String: Int64] {
    withLock {
      [
        "requested": counters.requested,
        "started": counters.started,
        "completed": counters.completed,
        "deduped": counters.deduped,
        "failed": counters.failed,
        "cancelled": counters.cancelled
      ]
    }
  }

  func ktv_HLSLoaderDidFinish(_ loader: KTVHCDataHLSLoader) {
    finish(loader: loader, error: nil, close: false)
  }

  func ktv_HLSLoader(
    _ loader: KTVHCDataHLSLoader,
    didFailWithError error: Error
  ) {
    finish(loader: loader, error: error, close: false)
  }

  func ktv_HLSLoader(
    _ loader: KTVHCDataHLSLoader,
    didChangeProgress progress: Double
  ) {}

  func ktv_HLSLoader(
    _ loader: KTVHCDataHLSLoader,
    makeURLsForContent content: String
  ) -> [URL] {
    guard let context = withLock({ activePrefetches[ObjectIdentifier(loader)] }) else {
      return []
    }

    if HlsLeadingSegments.isMaster(content) {
      guard let variant = HlsLeadingSegments.extractVariants(content).first else {
        markInvalidContent(loader)
        return []
      }
      markRedirected(loader)
      let variantUrl = HlsLeadingSegments.resolveUrl(base: context.url, relative: variant)
      enqueuePrefetch(
        url: variantUrl,
        headers: context.headers,
        durationSeconds: context.durationSeconds,
        originalUrl: context.originalUrl
      )
      return []
    }

    let selection = HlsLeadingSegments.extractLeadingSegments(
      content,
      minDurationSeconds: context.durationSeconds
    )
    guard !selection.segments.isEmpty else {
      markInvalidContent(loader)
      return []
    }
    let resources = ([selection.initSegment].compactMap { $0 } + selection.segments)
      .map { HlsLeadingSegments.resolveUrl(base: context.url, relative: $0) }
      .compactMap(URL.init(string:))
    if resources.isEmpty {
      markInvalidContent(loader)
    }
    return resources
  }

  private func startPrefetch(
    url: String,
    headers: [String: String]?,
    durationSeconds: Double,
    originalUrl: String
  ) {
    let dedupKey = HlsRequestIdentity.cacheNamespace(url: url, headers: headers)
    let isCancelled = withLock { () -> Bool in
      let remaining = max(0, (queuedPrefetches[dedupKey] ?? 1) - 1)
      if remaining == 0 {
        queuedPrefetches.removeValue(forKey: dedupKey)
      } else {
        queuedPrefetches[dedupKey] = remaining
      }
      let cancelled = pendingCancellations.contains(dedupKey)
      if cancelled && remaining == 0 {
        pendingCancellations.remove(dedupKey)
      }
      return cancelled
    }
    if isCancelled {
      return
    }
    guard HlsManifestUrl.matches(url) else {
      emitSettled(originalUrl)
      return
    }
    guard shouldPrefetch(key: dedupKey, durationSeconds: durationSeconds) else {
      withLock {
        counters.deduped += 1
      }
      emitSettled(originalUrl)
      return
    }

    HlsProxyRuntime.shared.ensureStartedForPrefetch()
    guard let requestUrl = URL(string: url) else {
      recordStartFailure(key: dedupKey, originalUrl: originalUrl, message: "Invalid HLS prefetch URL")
      return
    }
    let request = KTVHCDataRequest(
      url: requestUrl,
      headers: HlsRequestIdentity.transportHeaders(url: url, headers: headers)
    )
    guard let loader = KTVHTTPCache.cacheHLSLoader(with: request) else {
      recordStartFailure(key: dedupKey, originalUrl: originalUrl, message: "Failed to create HLS prefetch loader")
      return
    }
    let identifier = ObjectIdentifier(loader)
    let timeoutWorkItem = DispatchWorkItem { [weak self, weak loader] in
      guard let self, let loader else {
        return
      }
      let error = NSError(
        domain: "NitroPlayHlsPrefetch",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "HLS prefetch timed out"]
      )
      self.finish(loader: loader, error: error, close: true)
    }
    withLock {
      activePrefetches[identifier] = ActivePrefetch(
        loader: loader,
        url: url,
        headers: headers,
        durationSeconds: durationSeconds,
        originalUrl: originalUrl,
        dedupKey: dedupKey,
        timeoutWorkItem: timeoutWorkItem,
        redirected: false,
        invalidContent: false
      )
      counters.started += 1
    }
    loader.delegate = self
    queue.asyncAfter(deadline: .now() + Self.timeoutSeconds, execute: timeoutWorkItem)
    loader.prepare()
  }

  private func enqueuePrefetch(
    url: String,
    headers: [String: String]?,
    durationSeconds: Double,
    originalUrl: String
  ) {
    let key = HlsRequestIdentity.cacheNamespace(url: url, headers: headers)
    withLock {
      queuedPrefetches[key, default: 0] += 1
    }
    queue.async { [weak self] in
      self?.startPrefetch(url: url, headers: headers, durationSeconds: durationSeconds, originalUrl: originalUrl)
    }
  }

  private func shouldPrefetch(key: String, durationSeconds: Double) -> Bool {
    withLock {
      let now = Date().timeIntervalSince1970
      let previous = dedupEntries[key]
      if let previous,
         now - previous.timestamp < Self.dedupWindowSeconds,
         durationSeconds <= previous.durationSeconds {
        return false
      }

      dedupEntries[key] = DedupEntry(
        timestamp: now,
        durationSeconds: max(durationSeconds, previous?.durationSeconds ?? durationSeconds)
      )
      trimDedupEntries(now: now)
      return true
    }
  }

  private func trimDedupEntries(now: TimeInterval) {
    guard dedupEntries.count > Self.maxDedupEntries else {
      return
    }
    dedupEntries = dedupEntries.filter {
      now - $0.value.timestamp <= Self.dedupWindowSeconds
    }
    while dedupEntries.count > Self.maxDedupEntries,
          let oldest = dedupEntries.min(by: { $0.value.timestamp < $1.value.timestamp }) {
      dedupEntries.removeValue(forKey: oldest.key)
    }
  }

  private func markRedirected(_ loader: KTVHCDataHLSLoader) {
    withLock {
      activePrefetches[ObjectIdentifier(loader)]?.redirected = true
    }
  }

  private func markInvalidContent(_ loader: KTVHCDataHLSLoader) {
    withLock {
      activePrefetches[ObjectIdentifier(loader)]?.invalidContent = true
    }
  }

  private func finish(loader: KTVHCDataHLSLoader, error: Error?, close: Bool) {
    let context = withLock {
      activePrefetches.removeValue(forKey: ObjectIdentifier(loader))
    }
    guard let context else {
      return
    }
    context.timeoutWorkItem.cancel()
    if close {
      loader.close()
    }
    if context.redirected {
      return
    }
    if let error {
      recordFailure(context: context, message: error.localizedDescription)
      emitSettled(context.originalUrl)
      return
    }
    if context.invalidContent {
      recordFailure(context: context, message: "HLS manifest contains no media segments")
      emitSettled(context.originalUrl)
      return
    }
    withLock {
      counters.completed += 1
    }
    emitSettled(context.originalUrl)
  }

  private func recordStartFailure(key: String, originalUrl: String, message: String) {
    withLock {
      dedupEntries.removeValue(forKey: key)
      counters.failed += 1
    }
    logFailure(message)
    emitSettled(originalUrl)
  }

  private func recordFailure(context: ActivePrefetch, message: String) {
    withLock {
      dedupEntries.removeValue(forKey: context.dedupKey)
      counters.failed += 1
    }
    logFailure(message)
  }

  private func logFailure(_ message: String) {
    #if DEBUG
    NSLog("NitroPlay HLS prefetch failed: %@", message)
    #endif
  }

  private func emitSettled(_ url: String) {
    settledListeners.emit(event: "prefetchSettled") { (listener: (String) -> Void) in
      listener(url)
    }
  }

  private func withLock<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  private struct DedupEntry {
    let timestamp: TimeInterval
    let durationSeconds: Double
  }

  private struct ActivePrefetch {
    let loader: KTVHCDataHLSLoader
    let url: String
    let headers: [String: String]?
    let durationSeconds: Double
    let originalUrl: String
    let dedupKey: String
    let timeoutWorkItem: DispatchWorkItem
    var redirected: Bool
    var invalidContent: Bool
  }

  private struct Counters {
    var requested: Int64 = 0
    var started: Int64 = 0
    var completed: Int64 = 0
    var deduped: Int64 = 0
    var failed: Int64 = 0
    var cancelled: Int64 = 0
  }
}
