import type { NitroPlaybackPolicy } from '../surface/NitroPlaybackPolicy.js';
/**
 * Named playback contexts owned by the library. Consumers select a context by
 * name; raw group/priority numbers are not part of the public surface.
 */
export declare const NITRO_PLAYBACK_CONTEXTS: {
    readonly ring: {
        readonly group: "ring";
        readonly priority: 300;
        readonly resume: "automatic";
    };
    readonly ambient: {
        readonly group: "ambient";
        readonly priority: 325;
        readonly resume: "automatic";
    };
    readonly hero: {
        readonly group: "hero";
        readonly priority: 400;
        readonly resume: "manual";
    };
    readonly overlay: {
        readonly group: "overlay";
        readonly priority: 450;
        readonly resume: "automatic";
    };
    readonly system: {
        readonly group: "system";
        readonly priority: 475;
        readonly resume: "automatic";
    };
    readonly exclusive: {
        readonly group: "exclusive";
        readonly priority: 500;
        readonly resume: "automatic";
    };
};
export type NitroPlaybackContextName = keyof typeof NITRO_PLAYBACK_CONTEXTS;
export declare const resolvePlaybackContext: (name: NitroPlaybackContextName) => NitroPlaybackPolicy;
//# sourceMappingURL=playbackContexts.d.ts.map