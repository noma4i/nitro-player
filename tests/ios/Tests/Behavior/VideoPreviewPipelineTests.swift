@testable import NitroPlayKtvLedgerCore
@testable import NitroPlayPreviewCore
import XCTest

final class VideoPreviewPipelineTests: XCTestCase {
  func testHlsPlanAttemptsGeneratorBeforePlayerFallback() {
    XCTAssertEqual(
      VideoPreviewDecodePlan.make(isHls: true).stages,
      [.hlsManifestGenerator, .hlsPlayer]
    )
  }

  func testProgressivePlanUsesDirectGeneratorOnly() {
    XCTAssertEqual(
      VideoPreviewDecodePlan.make(isHls: false).stages,
      [.directAssetGenerator]
    )
  }

  func testHlsPlayerGrabRunsOffMainWithThumbnailCadence() {
    let policy = HlsPreviewGrabExecutionPolicy.thumbnail

    XCTAssertFalse(policy.requiresMainThread)
    XCTAssertGreaterThanOrEqual(policy.pixelBufferPollIntervalNs, 33_000_000)
  }

  func testKtvLedgerCountsOpenPlayerNetworkRequestsByStreamKey() {
    let ledger = KTVHCRequestLedger.shared()
    let streamKey = "clip-\(UUID().uuidString)"
    let requestId = ledger.beginRequest(
      with: URL(string: "https://cdn.example.test/video/\(streamKey)-hls-720p.ts")!,
      client: "player",
      clientPort: nil,
      userAgent: nil
    )

    XCTAssertEqual(ledger.openNetworkRequestCount(forClient: "player", streamKey: streamKey), 0)

    ledger.markUsedNetwork(forRequestId: requestId)
    XCTAssertEqual(ledger.openNetworkRequestCount(forClient: "player", streamKey: streamKey), 1)

    ledger.markDone(forRequestId: requestId)
    XCTAssertEqual(ledger.openNetworkRequestCount(forClient: "player", streamKey: streamKey), 0)
  }

  func testKtvLedgerDoesNotCountPreviewNetworkRequestsAsPlayerRequests() {
    let ledger = KTVHCRequestLedger.shared()
    let streamKey = "preview-\(UUID().uuidString)"
    let requestId = ledger.beginRequest(
      with: URL(string: "https://cdn.example.test/video/\(streamKey)-hls-720p.ts")!,
      client: "preview",
      clientPort: nil,
      userAgent: nil
    )

    ledger.markUsedNetwork(forRequestId: requestId)

    XCTAssertEqual(ledger.openNetworkRequestCount(forClient: "player", streamKey: streamKey), 0)
    XCTAssertEqual(ledger.openNetworkRequestCount(forClient: "preview", streamKey: streamKey), 1)

    ledger.markDone(forRequestId: requestId)
    XCTAssertEqual(ledger.openNetworkRequestCount(forClient: "preview", streamKey: streamKey), 0)
  }
}
