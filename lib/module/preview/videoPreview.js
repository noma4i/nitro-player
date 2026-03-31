"use strict";

import { NativeModules } from 'react-native';
const NativePreview = NativeModules?.NitroPlayStreamRuntime;
class VideoPreview {
  didWarnUnavailable = false;
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
    const resolved = typeof source === 'string' ? {
      uri: source,
      headers
    } : source;
    try {
      const result = await NativePreview.getThumbnailUrl(resolved.uri, resolved.headers ?? {});
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