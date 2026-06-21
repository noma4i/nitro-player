import AVFoundation

extension AVURLAsset {
  func getAssetInformation() async throws -> NitroPlayerInformation {
    let fileSize = try await NitroPlayerFileHelper.getFileSize(for: url)
    let loadedDuration = try await load(.duration)
    let durationValue: Int64
    let isLive: Bool

    // Check if asset is live stream
    if loadedDuration.flags.contains(.indefinite) {
      durationValue = -1
      isLive = true
    } else {
      durationValue = Int64(CMTimeGetSeconds(loadedDuration))
      isLive = false
    }

    var width = Double.nan
    var height = Double.nan
    var bitrate = Double.nan
    var orientation: NitroPlayerOrientation = .unknown
    var isHDR = false

    if let videoTrack = try await loadTracks(withMediaType: .video).first {
      let naturalSize = try await videoTrack.load(.naturalSize)
      let preferredTransform = try await videoTrack.load(.preferredTransform)
      let size = naturalSize.applying(preferredTransform)
      width = size.width
      height = size.height

      bitrate = Double(try await videoTrack.load(.estimatedDataRate))

      orientation = NitroPlayerOrientation.from(naturalSize: naturalSize, preferredTransform: preferredTransform)
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

private extension NitroPlayerOrientation {
  static func from(naturalSize: CGSize, preferredTransform: CGAffineTransform) -> NitroPlayerOrientation {
    let size = naturalSize.applying(preferredTransform)

    if size.width == size.height {
      return .square
    }

    let isNaturalSizePortrait = size.width < size.height
    let angle = atan2(Double(preferredTransform.b), Double(preferredTransform.a))
    let degrees = angle * 180 / .pi
    let rotation = degrees < 0 ? degrees + 360 : degrees

    switch rotation {
    case 0:
      return isNaturalSizePortrait ? .portrait : .landscapeRight
    case 90, -270:
      return .portrait
    case 180, -180:
      return isNaturalSizePortrait ? .portraitUpsideDown : .landscapeLeft
    case 270, -90:
      return .portraitUpsideDown
    default:
      return isNaturalSizePortrait ? .portrait : .landscape
    }
  }
}
