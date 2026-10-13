//
//  SourceLoader.swift
//  NitroPlay
//
//  Created by Krzysztof Moch on 27/01/2025.
//

import Foundation

private class AnyCancellable {
  private let _cancel: () -> Void

  init(_ cancel: @escaping () -> Void) {
    self._cancel = cancel
  }

  func cancel() {
    _cancel()
  }
}

actor SourceLoaderActor {
  private var currentOperation: (operationId: Int64, cancellable: AnyCancellable)?
  private var cancelledThroughOperationId: Int64 = 0

  func load<T>(operationId: Int64, priority: TaskPriority, operation: @escaping () async throws -> T) async throws -> T
  {
    currentOperation?.cancellable.cancel()
    guard operationId > cancelledThroughOperationId else {
      throw CancellationError()
    }

    let cancellableTask = Task(priority: priority) {
      try await operation()
    }

    let cancellable = AnyCancellable {
      cancellableTask.cancel()
    }
    currentOperation = (operationId: operationId, cancellable: cancellable)

    do {
      let result = try await cancellableTask.value
      clearCurrentOperation(operationId: operationId, cancellable: cancellable)
      return result
    } catch {
      clearCurrentOperation(operationId: operationId, cancellable: cancellable)
      if error is CancellationError {
        throw error
      }
      throw error
    }
  }

  func cancel(through operationId: Int64) {
    cancelledThroughOperationId = max(cancelledThroughOperationId, operationId)
    if let currentOperation, currentOperation.operationId <= operationId {
      currentOperation.cancellable.cancel()
    }
  }

  private func clearCurrentOperation(operationId: Int64, cancellable: AnyCancellable) {
    guard let currentOperation,
      currentOperation.operationId == operationId,
      currentOperation.cancellable === cancellable else {
      return
    }
    self.currentOperation = nil
  }
}

class SourceLoader {
  private let actor = SourceLoaderActor()
  private let operationLock = NSLock()
  private var lastIssuedOperationId: Int64 = 0

  private func issueOperationId() -> Int64 {
    operationLock.lock()
    defer { operationLock.unlock() }
    lastIssuedOperationId += 1
    return lastIssuedOperationId
  }

  private func cancellationCutoff() -> Int64 {
    operationLock.lock()
    defer { operationLock.unlock() }
    return lastIssuedOperationId
  }

  func load<T>(priority: TaskPriority = .userInitiated, operation: @escaping () async throws -> T)
    async throws -> T
  {
    let operationId = issueOperationId()
    return try await actor.load(operationId: operationId, priority: priority, operation: operation)
  }

  func cancel() async {
    let cutoff = cancellationCutoff()
    await actor.cancel(through: cutoff)
  }

  /// Fire-and-forget cancellation for non-async callers (release/deinit paths).
  /// The cancel is dispatched onto a detached task and is not awaited, so it is
  /// best-effort and not guaranteed to complete before the caller returns.
  func cancelDetached() {
    let cutoff = cancellationCutoff()
    Task {
      await actor.cancel(through: cutoff)
    }
  }
}
