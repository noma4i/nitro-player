import Foundation

final class SingleOwnerResourceSlot<Resource: AnyObject> {
  private let lock = NSLock()
  private let release: (Resource) -> Void
  private var resource: Resource?

  init(release: @escaping (Resource) -> Void) {
    self.release = release
  }

  var current: Resource? {
    lock.lock()
    defer { lock.unlock() }
    return resource
  }

  @discardableResult
  func replace(_ next: Resource) -> Resource? {
    let previous = swap(next)
    if let previous {
      release(previous)
    }
    return previous
  }

  @discardableResult
  func clear() -> Resource? {
    let previous = take()
    if let previous {
      release(previous)
    }
    return previous
  }

  @discardableResult
  func swap(_ next: Resource) -> Resource? {
    let previous: Resource?
    lock.lock()
    previous = resource
    resource = next
    lock.unlock()
    return previous
  }

  @discardableResult
  func take() -> Resource? {
    let previous: Resource?
    lock.lock()
    previous = resource
    resource = nil
    lock.unlock()
    return previous
  }

  func releaseResource(_ previous: Resource) {
    release(previous)
  }
}
