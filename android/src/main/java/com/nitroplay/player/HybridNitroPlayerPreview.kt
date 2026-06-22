package com.margelo.nitro.video

import android.os.Handler
import android.os.Looper
import com.nitroplay.hls.VideoPreviewRuntime

// First-frame / preview generation, split out of HybridNitroPlayer (mirror of the
// iOS HybridNitroPlayer preview extension). Extension functions keep the player's
// stored first-frame state in the host while grouping the generation logic.

internal fun HybridNitroPlayer.cancelFirstFrameRequest() {
  firstFrameRequest?.cancel()
  firstFrameRequest = null
  firstFrameTask?.cancel(true)
  firstFrameTask = null
  pendingFirstFrameGeneration = -1
}

internal fun HybridNitroPlayer.cacheFirstFrameContext(sourceUri: String, width: Double, height: Double) {
  firstFrameContext = HybridNitroPlayer.FirstFrameContext(
    sourceUri = sourceUri,
    headers = currentSourceConfig()?.headers,
    width = width,
    height = height
  )
}

internal fun HybridNitroPlayer.emitFirstFrame(uri: String, width: Double, height: Double, sourceUri: String, fromCache: Boolean) {
  val data = onFirstFrameData(
    uri = uri,
    width = width,
    height = height,
    sourceUri = sourceUri,
    fromCache = fromCache
  )
  firstFrame = data
  eventEmitter.onFirstFrame(data)
}

internal fun HybridNitroPlayer.requestFirstFrameIfNeeded() {
  if (isReleased || !hasActiveSource || !readyToDisplay || firstFrame != null) {
    return
  }
  val autoThumbnailEnabled = currentAutoThumbnailEnabled()

  when (currentPreviewMode()) {
    NitroSourcePreviewMode.MANUAL -> {
      if (!autoThumbnailEnabled) {
        return
      }
    }
    NitroSourcePreviewMode.LISTENER -> {
      if (!autoThumbnailEnabled && !eventEmitter.hasOnFirstFrameListeners()) {
        return
      }
    }
    NitroSourcePreviewMode.ALWAYS -> Unit
  }

  val context = firstFrameContext ?: return
  val generation = sourceGeneration
  if (pendingFirstFrameGeneration == generation) {
    return
  }
  pendingFirstFrameGeneration = generation
  val previewConfig = currentSourceConfig()?.preview
  val request = VideoPreviewRuntime.startFirstFrameRequest(
    context.sourceUri,
    context.headers,
    previewConfig
  ) ?: run {
    pendingFirstFrameGeneration = -1
    return
  }
  firstFrameRequest = request

  firstFrameTask = VideoPreviewRuntime.dispatchFirstFrameAwait {
    val preview = try {
      if (isReleased) {
        null
      } else {
        request.await()
      }
    } finally {
      request.cancel()
    }

    Handler(Looper.getMainLooper()).post {
      if (pendingFirstFrameGeneration == generation) {
        pendingFirstFrameGeneration = -1
        firstFrameTask = null
      }
      if (firstFrameRequest === request) {
        firstFrameRequest = null
      }

      if (
        isReleased ||
        sourceGeneration != generation ||
        !hasActiveSource ||
        !readyToDisplay ||
        firstFrame != null
      ) {
        return@post
      }

      preview?.let {
        emitFirstFrame(
          uri = it.uri,
          width = context.width,
          height = context.height,
          sourceUri = context.sourceUri,
          fromCache = it.fromCache
        )
      }
    }
  }
}

private fun HybridNitroPlayer.currentPreviewMode(): NitroSourcePreviewMode {
  return currentSourceConfig()?.preview?.mode ?: NitroSourcePreviewMode.LISTENER
}

private fun HybridNitroPlayer.currentAutoThumbnailEnabled(): Boolean {
  return currentSourceConfig()?.preview?.autoThumbnail ?: true
}
