import AVFoundation

extension AVURLAsset {
  func getAssetInformation() async throws -> NitroPlayerInformation {
    let fileSize = try await NitroPlayerFileHelper.getFileSize(for: url)
    let durationValue: Int64
    let isLive: Bool

    // Check if asset is live stream
    if duration.flags.contains(.indefinite) {
      durationValue = -1
      isLive = true
    } else {
      durationValue = Int64(CMTimeGetSeconds(duration))
      isLive = false
    }

    var width = Double.nan
    var height = Double.nan
    var bitrate = Double.nan
    var orientation: NitroPlayerOrientation = .unknown
    var isHDR = false

    if let videoTrack = tracks(withMediaType: .video).first {
      let size = videoTrack.naturalSize.applying(videoTrack.preferredTransform)
      width = size.width
      height = size.height

      bitrate = Double(videoTrack.estimatedDataRate)

      orientation = videoTrack.orientation

      if #available(iOS 14.0, tvOS 14.0, visionOS 1.0, *) {
        isHDR = videoTrack.hasMediaCharacteristic(.containsHDRVideo)
      }
    }

    return NitroPlayerInformation(
      bitrate: bitrate,
      width: width,
      height: height,
      duration: durationValue,
      fileSize: fileSize,
      isHDR: isHDR,
      isLive: isLive,
      orientation: orientation
    )
  }
}
