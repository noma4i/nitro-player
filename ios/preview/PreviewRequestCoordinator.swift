import Foundation

protocol CancellablePreviewTask<Output>: AnyObject, Sendable {
  associatedtype Output: Sendable
  func value() async -> Output?
  func cancel()
}

final class TaskPreviewJob<Output: Sendable>: CancellablePreviewTask, @unchecked Sendable {
  private let task: Task<Output?, Never>

  init(task: Task<Output?, Never>) {
    self.task = task
  }

  func value() async -> Output? {
    await task.value
  }

  func cancel() {
    task.cancel()
  }
}

final class PreviewRequest<Output: Sendable>: @unchecked Sendable {
  private let lock = NSLock()
  private let cachedResult: Output?
  private let key: String?
  private let entry: PreviewRequestCoordinator<Output>.Entry?
  private weak var coordinator: PreviewRequestCoordinator<Output>?
  private var cancelled = false

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }

  init(cachedResult: Output) {
    self.cachedResult = cachedResult
    self.key = nil
    self.entry = nil
    self.coordinator = nil
  }

  fileprivate init(
    key: String,
    entry: PreviewRequestCoordinator<Output>.Entry,
    coordinator: PreviewRequestCoordinator<Output>
  ) {
    self.cachedResult = nil
    self.key = key
    self.entry = entry
    self.coordinator = coordinator
  }

  func value() async -> Output? {
    if isCancelled {
      return nil
    }
    if let cachedResult {
      return cachedResult
    }
    if entry?.isCancelled == true {
      return nil
    }
    let result = await entry?.job.value()
    return isCancelled || entry?.isCancelled == true ? nil : result
  }

  func cancel() {
    lock.lock()
    if cancelled {
      lock.unlock()
      return
    }
    cancelled = true
    lock.unlock()

    guard let key, let entry else {
      return
    }
    coordinator?.release(key: key, entry: entry)
  }
}

final class PreviewRequestCoordinator<Output: Sendable>: @unchecked Sendable {
  final class Entry: @unchecked Sendable {
    private let lock = NSLock()
    let job: any CancellablePreviewTask<Output>
    var waiters: Int = 0

    var isCancelled: Bool {
      lock.lock()
      defer { lock.unlock() }
      return cancelled
    }

    private var cancelled = false

    init(job: any CancellablePreviewTask<Output>) {
      self.job = job
    }

    func cancel() {
      lock.lock()
      if cancelled {
        lock.unlock()
        return
      }
      cancelled = true
      lock.unlock()
      job.cancel()
    }
  }

  private let queue = DispatchQueue(label: "com.nitroplay.preview.request-coordinator")
  private var inflight: [String: Entry] = [:]

  var inflightCount: Int {
    queue.sync { inflight.count }
  }

  func cached(_ result: Output) -> PreviewRequest<Output> {
    PreviewRequest(cachedResult: result)
  }

  func acquire(
    key: String,
    createJob: () -> any CancellablePreviewTask<Output>
  ) -> PreviewRequest<Output> {
    queue.sync {
      let entry: Entry
      if let existing = inflight[key] {
        entry = existing
      } else {
        let created = Entry(job: createJob())
        inflight[key] = created
        entry = created
      }
      entry.waiters += 1
      return PreviewRequest(key: key, entry: entry, coordinator: self)
    }
  }

  func cancelAll() {
    queue.sync {
      inflight.values.forEach {
        $0.cancel()
      }
      inflight.removeAll()
    }
  }

  fileprivate func release(key: String, entry: Entry) {
    queue.sync {
      guard inflight[key] === entry else {
        return
      }
      entry.waiters = max(0, entry.waiters - 1)
      if entry.waiters == 0 {
        inflight.removeValue(forKey: key)
        entry.cancel()
      }
    }
  }
}
