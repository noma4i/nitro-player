//
//  HybridNitroPlayerPreview.swift
//  NitroPlay
//

import AVFoundation
import Foundation

extension HybridNitroPlayer {
  // MARK: - First-frame / preview generation

  func cancelFirstFrameRequest() {
    firstFrameRequest?.cancel()
    firstFrameRequest = nil
    firstFrameTask?.cancel()
    firstFrameTask = nil
  }

  func cacheFirstFrameContext(sourceUri: String, width: Double, height: Double) {
    firstFrameContext = FirstFrameContext(
      sourceUri: sourceUri,
      headers: currentSourceConfig()?.headers,
      width: width,
      height: height
    )
  }

  func emitFirstFrame(uri: String, width: Double, height: Double, sourceUri: String, fromCache: Bool) {
    let data = onFirstFrameData(
      uri: uri,
      width: width,
      height: height,
      sourceUri: sourceUri,
      fromCache: fromCache
    )
    firstFrame = data
    _eventEmitter?.onFirstFrame(data)
  }

  func markReadyToDisplay() {
    guard !isReleased else { return }
    readyToDisplay = true
    requestFirstFrameIfNeeded()
    emitPlaybackState()
  }

  func requestFirstFrameIfNeeded() {
    guard !isReleased, hasActiveSource, readyToDisplay, firstFrame == nil else { return }
    guard let context = firstFrameContext else { return }
    let autoThumbnailEnabled = currentAutoThumbnailEnabled()

    switch currentPreviewMode() {
    case .manual:
      guard autoThumbnailEnabled else { return }
    case .listener:
      guard autoThumbnailEnabled || _eventEmitter?.hasOnFirstFrameListeners() == true else { return }
    case .always:
      break
    @unknown default:
      break
    }

    let generation = sourceGeneration
    if firstFrameTask != nil {
      return
    }

    guard let request = VideoPreviewRuntime.shared.startFirstFrameRequest(
      url: context.sourceUri,
      headers: context.headers,
      preview: currentSourceConfig()?.preview
    ) else {
      return
    }
    firstFrameRequest = request

    firstFrameTask = Task.detached(priority: .utility) { [weak self] in
      guard let self else { return }
      let result = await request.value()
      request.cancel()

      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        defer {
          if self.firstFrameRequest === request {
            self.firstFrameRequest = nil
            self.firstFrameTask = nil
          }
        }
        guard !self.isReleased, self.sourceGeneration == generation, self.hasActiveSource, self.readyToDisplay, self.firstFrame == nil else {
          return
        }
        guard let result else { return }
        self.emitFirstFrame(
          uri: result.uri,
          width: context.width,
          height: context.height,
          sourceUri: context.sourceUri,
          fromCache: result.fromCache
        )
      }
    }
  }

  private func currentPreviewMode() -> NitroSourcePreviewMode {
    currentSourceConfig()?.preview?.mode ?? .listener
  }

  private func currentAutoThumbnailEnabled() -> Bool {
    currentSourceConfig()?.preview?.autoThumbnail ?? true
  }
}
