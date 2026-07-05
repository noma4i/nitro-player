import { resolveSource } from '../source/resolveSource';
import type { ResolvableSource } from '../source/resolveSource';
import type { NitroVideoPreview } from '../bridge/nitro/NitroVideoPreview.nitro';
import { createNativeNitroObject, createUnavailableWarner } from '../support/nativeNitroObject';
import type { StreamHeaders } from '../streaming/types';

const NativePreview = createNativeNitroObject<NitroVideoPreview>('NitroVideoPreview');

class VideoPreview {
  private readonly warnUnavailable = createUnavailableWarner('VideoPreview');

  async getFirstFrame(source: ResolvableSource, headers?: StreamHeaders): Promise<string | null> {
    if (!NativePreview) {
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

  async peekFirstFrame(source: ResolvableSource, headers?: StreamHeaders): Promise<string | null> {
    if (!NativePreview) {
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

export const videoPreview = new VideoPreview();
