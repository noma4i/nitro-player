import type { Int64 } from 'react-native-nitro-modules';
import type { NitroPlayerOrientation } from './NitroPlayerOrientation';
export interface NitroPlayerInformation {
    /**
     * The bitrate of the video in kbps.
     */
    bitrate: number;
    /**
     * The width of the video in pixels.
     */
    width: number;
    /**
     * The height of the video in pixels.
     */
    height: number;
    /**
     * The duration of the video in seconds.
     */
    duration: Int64;
    /**
     * The file size of the video in bytes.
     */
    fileSize: Int64;
    /**
     * Whether the video is HDR.
     */
    isHDR: boolean;
    /**
     * Whether the video is live
     */
    isLive: boolean;
    /**
     * The orientation of the video.
     * see {@link NitroPlayerOrientation}
     */
    orientation: NitroPlayerOrientation;
}
//# sourceMappingURL=NitroPlayerInformation.d.ts.map