import XCTest

private enum TestPlayerError: Equatable {
  case notInitialized
  case assetNotInitialized
  case invalidSource
  case invalidTrackUrl(url: String)
  case cancelled

  var code: String {
    switch self {
    case .notInitialized: return "player/not-initialized"
    case .assetNotInitialized: return "player/asset-not-initialized"
    case .invalidSource: return "player/invalid-source"
    case .invalidTrackUrl: return "player/invalid-track-url"
    case .cancelled: return "player/cancelled"
    }
  }

  var message: String {
    switch self {
    case .notInitialized: return "Player has not been initialized (Or has been set to nil)"
    case .assetNotInitialized: return "Asset has not been initialized (Or has been set to nil)"
    case .invalidSource: return "Invalid source passed to player"
    case let .invalidTrackUrl(url): return "Invalid track URL: \(url)"
    case .cancelled: return "Operation was cancelled"
    }
  }
}

private enum TestSourceError: Equatable {
  case invalidUri(uri: String)
  case missingReadFilePermission(uri: String)
  case fileDoesNotExist(uri: String)
  case failedToInitializeAsset
  case unsupportedContentType(uri: String)
  case cancelled

  var code: String {
    switch self {
    case .invalidUri: return "source/invalid-uri"
    case .missingReadFilePermission: return "source/missing-read-file-permission"
    case .fileDoesNotExist: return "source/file-does-not-exist"
    case .failedToInitializeAsset: return "source/failed-to-initialize-asset"
    case .unsupportedContentType: return "source/unsupported-content-type"
    case .cancelled: return "source/cancelled"
    }
  }

  var message: String {
    switch self {
    case let .invalidUri(uri): return "Invalid source file uri: \(uri)"
    case let .missingReadFilePermission(uri): return "Missing read file permission for source file at \(uri)"
    case let .fileDoesNotExist(uri): return "File does not exist at URI: \(uri)"
    case .failedToInitializeAsset: return "Failed to initialize asset"
    case let .unsupportedContentType(uri): return "type of content (\(uri)) is not supported"
    case .cancelled: return "Operation was cancelled"
    }
  }
}

private enum TestLibraryError {
  case deallocated(objectName: String)

  var code: String { "library/deallocated" }
  var message: String {
    switch self {
    case let .deallocated(name): return "Object \(name) has been deallocated"
    }
  }
}

private enum TestViewError {
  case viewNotFound(nitroId: Double)
  case viewIsDeallocated

  var code: String {
    switch self {
    case .viewNotFound: return "view/not-found"
    case .viewIsDeallocated: return "view/deallocated"
    }
  }

  var message: String {
    switch self {
    case let .viewNotFound(id): return "View with nitroId \(id) not found"
    case .viewIsDeallocated: return "Attempt to access a view, but it has been deallocated (or not initialized)"
    }
  }
}

final class NitroPlayerErrorTests: XCTestCase {
  func testPlayerNotInitializedCode() {
    XCTAssertEqual(TestPlayerError.notInitialized.code, "player/not-initialized")
  }

  func testPlayerNotInitializedMessage() {
    XCTAssertTrue(TestPlayerError.notInitialized.message.contains("not been initialized"))
  }

  func testPlayerInvalidTrackUrlContainsUrl() {
    let err = TestPlayerError.invalidTrackUrl(url: "bad://url")
    XCTAssertEqual(err.code, "player/invalid-track-url")
    XCTAssertTrue(err.message.contains("bad://url"))
  }

  func testPlayerCancelledCode() {
    XCTAssertEqual(TestPlayerError.cancelled.code, "player/cancelled")
  }

  func testSourceInvalidUriContainsUri() {
    let err = TestSourceError.invalidUri(uri: "not-a-uri")
    XCTAssertEqual(err.code, "source/invalid-uri")
    XCTAssertTrue(err.message.contains("not-a-uri"))
  }

  func testSourceCancelledCode() {
    XCTAssertEqual(TestSourceError.cancelled.code, "source/cancelled")
  }

  func testSourceFileDoesNotExist() {
    let err = TestSourceError.fileDoesNotExist(uri: "/tmp/missing.mp4")
    XCTAssertEqual(err.code, "source/file-does-not-exist")
    XCTAssertTrue(err.message.contains("/tmp/missing.mp4"))
  }

  func testLibraryDeallocatedContainsName() {
    let err = TestLibraryError.deallocated(objectName: "HybridNitroPlayer")
    XCTAssertEqual(err.code, "library/deallocated")
    XCTAssertTrue(err.message.contains("HybridNitroPlayer"))
  }

  func testViewNotFoundContainsId() {
    let err = TestViewError.viewNotFound(nitroId: 42.0)
    XCTAssertEqual(err.code, "view/not-found")
    XCTAssertTrue(err.message.contains("42"))
  }

  func testViewDeallocatedCode() {
    XCTAssertEqual(TestViewError.viewIsDeallocated.code, "view/deallocated")
  }
}
