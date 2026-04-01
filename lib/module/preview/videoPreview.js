"use strict";

import { NativeModules } from 'react-native';
const NativePreview = NativeModules?.NitroPlayStreamRuntime;
class VideoPreview {
  didWarnUnavailable = false;
  resolveSource(source, headers) {
    return typeof source === 'string' ? {
      uri: source,
      headers
    } : source;
  }
  warnUnavailable() {
    if (this.didWarnUnavailable) {
      return;
    }
    this.didWarnUnavailable = true;
    console.warn('[VideoPreview] Native module not available');
  }
  async getFirstFrame(source, headers) {
    if (!NativePreview?.getThumbnailUrl) {
      this.warnUnavailable();
      return null;
    }
    const resolved = this.resolveSource(source, headers);
    try {
      const result = await NativePreview.getThumbnailUrl(resolved.uri, resolved.headers ?? {});
      return result ?? null;
    } catch {
      return null;
    }
  }
  async peekFirstFrame(source, headers) {
    if (!NativePreview?.peekThumbnailUrl) {
      return null;
    }
    const resolved = this.resolveSource(source, headers);
    try {
      const result = await NativePreview.peekThumbnailUrl(resolved.uri, resolved.headers ?? {});
      return result ?? null;
    } catch {
      return null;
    }
  }
  async clear() {
    if (!NativePreview?.clearPreview) {
      return true;
    }
    try {
      return await NativePreview.clearPreview();
    } catch {
      return false;
    }
  }
}
export const videoPreview = new VideoPreview();
//# sourceMappingURL=videoPreview.js.map