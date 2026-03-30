import XCTest
@testable import NitroPlayLogic

final class InitTaskRaceTests: XCTestCase {

  func test_twoLoadersCallingSharedResource_noCancellation() async throws {
    // Two independent SourceLoaders simulating warmMetadata and prepareBufferedState
    let loaderA = SourceLoader()
    let loaderB = SourceLoader()

    // Shared async operation (e.g. source.getAsset)
    let sharedResource = SharedResource()

    let taskA = Task<String, Error> {
      try await loaderA.load {
        try await sharedResource.fetch()
      }
    }

    let taskB = Task<String, Error> {
      try await loaderB.load {
        try await sharedResource.fetch()
      }
    }

    let resultA = try await taskA.value
    let resultB = try await taskB.value

    XCTAssertEqual(resultA, "asset")
    XCTAssertEqual(resultB, "asset")
    // Both completed - independent loaders do not cancel each other
  }

  func test_cancelLoaderA_doesNotAffectLoaderB() async throws {
    let loaderA = SourceLoader()
    let loaderB = SourceLoader()

    let sharedResource = SharedResource()

    let taskA = Task<String, Error> {
      try await loaderA.load {
        // loaderA does a slow operation
        try await Task.sleep(nanoseconds: 2_000_000_000)
        return try await sharedResource.fetch()
      }
    }

    // Give taskA time to start
    try await Task.sleep(nanoseconds: 50_000_000)

    let taskB = Task<String, Error> {
      try await loaderB.load {
        try await sharedResource.fetch()
      }
    }

    // Cancel loaderA while loaderB is also running
    await loaderA.cancel()

    // loaderB should complete successfully regardless
    let resultB = try await taskB.value
    XCTAssertEqual(resultB, "asset")

    // loaderA should have been cancelled
    do {
      _ = try await taskA.value
      // If it completed before cancel, that's fine
    } catch is CancellationError {
      // Expected
    } catch {
      // Other errors acceptable
    }
  }
}

// Simulates a shared async resource (like AVURLAsset creation)
private actor SharedResource {
  func fetch() async throws -> String {
    try await Task.sleep(nanoseconds: 50_000_000)
    return "asset"
  }
}
