import { NativeModules } from 'react-native';
import type { StreamHeaders } from '../transport/types';

interface VideoPreviewNativeModule {
  getThumbnailUrl: (url: string, headers?: StreamHeaders) => Promise<string | null>;
  clearPreview?: () => Promise<boolean>;
}

const NativePreview = NativeModules?.NitroPlayStreamRuntime as VideoPreviewNativeModule | undefined;

class VideoPreview {
  private didWarnUnavailable = false;

  private warnUnavailable(): void {
    if (this.didWarnUnavailable) {
      return;
    }

    this.didWarnUnavailable = true;
    console.warn('[VideoPreview] Native module not available');
  }

  async getFirstFrame(source: { uri: string; headers?: StreamHeaders } | string, headers?: StreamHeaders): Promise<string | null> {
    if (!NativePreview?.getThumbnailUrl) {
      this.warnUnavailable();
      return null;
    }

    const resolved = typeof source === 'string'
      ? { uri: source, headers }
      : source;

    try {
      const result = await NativePreview.getThumbnailUrl(resolved.uri, resolved.headers ?? {});
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
