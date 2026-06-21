import type { StreamHeaders } from '../streaming/types';
declare class VideoPreview {
    private readonly warnUnavailable;
    getFirstFrame(source: {
        uri: string;
        headers?: StreamHeaders;
    } | string, headers?: StreamHeaders): Promise<string | null>;
    peekFirstFrame(source: {
        uri: string;
        headers?: StreamHeaders;
    } | string, headers?: StreamHeaders): Promise<string | null>;
    clear(): Promise<boolean>;
}
export declare const videoPreview: VideoPreview;
export {};
//# sourceMappingURL=videoPreview.d.ts.map