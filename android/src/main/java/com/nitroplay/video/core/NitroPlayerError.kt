package com.nitroplay.video.core

// Base class for all video errors
abstract class NitroPlayerError(
    open val code: String,
    message: String
) : Error("{%@$code::$message@%}")

// Library related errors
sealed class LibraryError(code: String, message: String) : NitroPlayerError(code, message) {
  object Deallocated : LibraryError(
    "library/deallocated",
    "Object has been deallocated"
  )

  object ApplicationContextNotFound : LibraryError(
    "library/application-context-not-found",
    "Application context not found"
  )

  class MethodNotSupported(val methodName: String) : LibraryError(
    "library/method-not-supported",
    "Method $methodName() is not supported on Android"
  )
}

// Player related errors
sealed class PlayerError(code: String, message: String) : NitroPlayerError(code, message) {
  object NotInitialized : PlayerError(
    "player/not-initialized",
    "Player has not been initialized (Or has been set to null)"
  )

  object AssetNotInitialized : PlayerError(
    "player/asset-not-initialized",
    "Asset has not been initialized (Or has been set to null)"
  )

  object InvalidSource : PlayerError(
    "player/invalid-source",
    "Invalid source passed to player"
  )

  object Cancelled : PlayerError(
    "player/cancelled",
    "Operation was cancelled"
  )
}

// Source related errors
sealed class SourceError(code: String, message: String) : NitroPlayerError(code, message) {
  class InvalidUri(val uri: String) : SourceError(
    "source/invalid-uri",
    "Invalid source file uri: $uri"
  )

  class MissingReadFilePermission(val uri: String) : SourceError(
    "source/missing-read-file-permission",
    "Missing read file permission for source file at $uri"
  )

  class FileDoesNotExist(val uri: String) : SourceError(
    "source/file-does-not-exist",
    "File does not exist at URI: $uri"
  )

  object FailedToInitializeAsset : SourceError(
    "source/failed-to-initialize-asset",
    "Failed to initialize asset"
  )

  class UnsupportedContentType(val uri: String) : SourceError(
    "source/unsupported-content-type",
    "type of content (${uri}) is not supported"
  )

  object Cancelled : SourceError(
    "source/cancelled",
    "Operation was cancelled"
  )
}

// View related errors
sealed class NitroPlayerViewError(code: String, message: String) : NitroPlayerError(code, message) {
  class ViewNotFound(val viewId: Int) : NitroPlayerViewError(
    "view/not-found",
    "View with viewId $viewId not found"
  )
  object ViewIsDeallocated : NitroPlayerViewError(
    "view/deallocated",
    "Attempt to access a view, but it has been deallocated (or not initialized)"
  )
}

// Unknown error
class UnknownError : NitroPlayerError("unknown/unknown", "Unknown error")
