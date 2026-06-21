import type { ResolvableSource } from '../source/resolveSource';
import type { StreamHeaders } from '../streaming/types';
declare class VideoPreview {
    private readonly warnUnavailable;
    getFirstFrame(source: ResolvableSource, headers?: StreamHeaders): Promise<string | null>;
    peekFirstFrame(source: ResolvableSource, headers?: StreamHeaders): Promise<string | null>;
    clear(): Promise<boolean>;
}
export declare const videoPreview: VideoPreview;
export {};
//# sourceMappingURL=videoPreview.d.ts.map