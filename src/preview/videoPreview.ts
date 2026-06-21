import { resolveSource } from '../source/resolveSource';
import { createUnavailableWarner, getNativeStreamRuntime } from '../support/nativeStreamRuntime';
import type { StreamHeaders } from '../streaming/types';

interface VideoPreviewNativeModule {
  getThumbnailUrl: (url: string, headers?: StreamHeaders) => Promise<string | null>;
  peekThumbnailUrl?: (url: string, headers?: StreamHeaders) => Promise<string | null>;
  clearPreview?: () => Promise<boolean>;
}

const NativePreview = getNativeStreamRuntime<VideoPreviewNativeModule>();

class VideoPreview {
  private readonly warnUnavailable = createUnavailableWarner('VideoPreview');

  async getFirstFrame(source: { uri: string; headers?: StreamHeaders } | string, headers?: StreamHeaders): Promise<string | null> {
    if (!NativePreview?.getThumbnailUrl) {
      this.warnUnavailable();
      return null;
    }

    const resolved = resolveSource(source, headers);

    try {
      const result = await NativePreview.getThumbnailUrl(resolved.uri, resolved.headers);
      return result ?? null;
    } catch {
      return null;
    }
  }

  async peekFirstFrame(source: { uri: string; headers?: StreamHeaders } | string, headers?: StreamHeaders): Promise<string | null> {
    if (!NativePreview?.peekThumbnailUrl) {
      return null;
    }

    const resolved = resolveSource(source, headers);

    try {
      const result = await NativePreview.peekThumbnailUrl(resolved.uri, resolved.headers);
      return result ?? null;
    } catch {
      return null;
    }
  }

  async clear(): Promise<boolean> {
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
