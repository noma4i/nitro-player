import XCTest
@testable import NitroPlayLogic

final class PlayerMutationExecutorTests: XCTestCase {
  func testRunAndWaitExecutesOffMainWhenSubmittedFromMain() async {
    let executor = PlayerMutationExecutor(label: "com.nitroplay.tests.player-mutation.main")
    let completed = expectation(description: "executor completed")
    let capture = ThreadCapture()

    DispatchQueue.main.async {
      Task {
        await executor.runAndWait {
          capture.set(Thread.isMainThread)
        }
        completed.fulfill()
      }
    }

    await fulfillment(of: [completed], timeout: 2)
    XCTAssertEqual(capture.value, false)
  }

  func testRunAndWaitPreservesSerialOrdering() async {
    let executor = PlayerMutationExecutor(label: "com.nitroplay.tests.player-mutation.order")
    var values: [Int] = []

    await executor.runAndWait {
      values.append(1)
    }
    await executor.runAndWait {
      values.append(2)
    }

    XCTAssertEqual(values, [1, 2])
  }

  func testBufferedPrepareDoesNotSwapPlayerItemOnMainActor() throws {
    let source = try Self.readRepositoryFile("ios/hybrids/NitroPlayer/HybridNitroPlayerLifecycle.swift")
    let body = try XCTUnwrap(Self.prepareBufferedStateBody(in: source))

    XCTAssertTrue(body.contains("playerMutationExecutor.runAndWait"))
    XCTAssertFalse(body.contains("MainActor.run"))
    XCTAssertTrue(body.contains("player.replaceCurrentItem(with: playerItem)"))
  }

  func testPlayerObserverCallbacksReturnToMainQueueAfterOffMainMutation() throws {
    let source = try Self.readRepositoryFile("ios/core/NitroPlayerObserver.swift")
    let directOptionalDelegateCalls = source
      .split(separator: "\n")
      .filter { $0.contains("delegate?.on") }

    XCTAssertTrue(source.contains("private func notifyDelegate"))
    XCTAssertTrue(source.contains("DispatchQueue.main.async"))
    XCTAssertTrue(
      directOptionalDelegateCalls.isEmpty,
      "Observer callbacks must use notifyDelegate so off-main AVPlayer mutations do not mutate playback state off main: \(directOptionalDelegateCalls)"
    )
  }

  private static func readRepositoryFile(_ path: String) throws -> String {
    let sourcePath = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(path)
    return try String(contentsOf: sourcePath)
  }

  private static func prepareBufferedStateBody(in source: String) -> String? {
    guard let signature = source.range(of: "func prepareBufferedState() async throws"),
          let openingBrace = source[signature.lowerBound...].firstIndex(of: "{") else {
      return nil
    }

    var depth = 0
    var index = openingBrace
    while index < source.endIndex {
      let character = source[index]
      if character == "{" {
        depth += 1
      } else if character == "}" {
        depth -= 1
        if depth == 0 {
          return String(source[openingBrace...index])
        }
      }
      index = source.index(after: index)
    }

    return nil
  }
}

private final class ThreadCapture: @unchecked Sendable {
  private let lock = NSLock()
  private var capturedValue: Bool?

  var value: Bool? {
    lock.withLock {
      capturedValue
    }
  }

  func set(_ value: Bool) {
    lock.withLock {
      capturedValue = value
    }
  }
}
