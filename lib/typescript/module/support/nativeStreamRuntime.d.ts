/**
 * Single accessor for the `NitroPlayStreamRuntime` legacy native module shared by
 * the stream cache and video preview surfaces. Callers cast to their own facade type.
 */
export declare const getNativeStreamRuntime: <T>() => T | undefined;
/**
 * Builds a warn-once callback for when the native module is unavailable, so each
 * surface logs at most one warning instead of duplicating the guard logic.
 */
export declare const createUnavailableWarner: (tag: string) => (() => void);
//# sourceMappingURL=nativeStreamRuntime.d.ts.map