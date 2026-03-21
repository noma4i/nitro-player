import AVFoundation
import XCTest
@testable import NitroPlay

final class NitroPlayerObserverTests: XCTestCase {
  func testInvalidatePlayerItemObserversRemovesOutputsFromObservedItem() throws {
    let source = try HybridNitroPlayerSource(
      config: NativeNitroPlayerConfig(
        uri: "https://cdn.example.com/video.mp4",
        memoryConfig: nil,
        headers: nil,
        bufferConfig: nil,
        metadata: nil,
        initializeOnCreation: false,
        useHlsProxy: nil
      )
    )
    let player = try HybridNitroPlayer(source: source)
    guard let observer = player.playerObserver else {
      XCTFail("Missing player observer")
      return
    }

    let item = AVPlayerItem(url: URL(string: "https://cdn.example.com/video.mp4")!)
    let metadataOutput = AVPlayerItemMetadataOutput()
    let legibleOutput = AVPlayerItemLegibleOutput()

    item.add(metadataOutput)
    item.add(legibleOutput)
    observer.observedPlayerItem = item
    observer.metadataOutput = metadataOutput
    observer.legibleOutput = legibleOutput

    observer.invalidatePlayerItemObservers()

    XCTAssertFalse(item.outputs.contains { $0 === metadataOutput })
    XCTAssertFalse(item.outputs.contains { $0 === legibleOutput })
    XCTAssertNil(observer.observedPlayerItem)
    XCTAssertNil(observer.metadataOutput)
    XCTAssertNil(observer.legibleOutput)

    player.release()
  }
}
