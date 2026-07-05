"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.videoPreview = void 0;
var _resolveSource = require("../source/resolveSource.js");
var _nativeNitroObject = require("../support/nativeNitroObject.js");
const NativePreview = (0, _nativeNitroObject.createNativeNitroObject)('NitroVideoPreview');
class VideoPreview {
  warnUnavailable = (0, _nativeNitroObject.createUnavailableWarner)('VideoPreview');
  async getFirstFrame(source, headers) {
    if (!NativePreview) {
      this.warnUnavailable();
      return null;
    }
    const resolved = (0, _resolveSource.resolveSource)(source, headers);
    try {
      const result = await NativePreview.getThumbnailUrl(resolved.uri, resolved.headers);
      return result ?? null;
    } catch {
      return null;
    }
  }
  async peekFirstFrame(source, headers) {
    if (!NativePreview) {
      return null;
    }
    const resolved = (0, _resolveSource.resolveSource)(source, headers);
    try {
      const result = await NativePreview.peekThumbnailUrl(resolved.uri, resolved.headers);
      return result ?? null;
    } catch {
      return null;
    }
  }
  async clear() {
    if (!NativePreview) {
      return true;
    }
    try {
      return await NativePreview.clearPreview();
    } catch {
      return false;
    }
  }
}
const videoPreview = exports.videoPreview = new VideoPreview();
//# sourceMappingURL=videoPreview.js.map