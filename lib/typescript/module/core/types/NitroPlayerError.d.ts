export type LibraryError = 'library/deallocated' | 'library/application-context-not-found';
export type PlayerError = 'player/released' | 'player/not-initialized' | 'player/asset-not-initialized' | 'player/invalid-source';
export type SourceError = 'source/invalid-uri' | 'source/missing-read-file-permission' | 'source/file-does-not-exist' | 'source/failed-to-initialize-asset' | 'source/unsupported-content-type';
export type NitroPlayerViewError = 'view/not-found' | 'view/deallocated' | 'view/picture-in-picture-not-supported';
export type UnknownError = 'unknown/unknown';
export type NitroPlayerErrorCode = LibraryError | PlayerError | SourceError | NitroPlayerViewError | UnknownError;
export declare class NitroPlayerError<TCode extends NitroPlayerErrorCode> extends Error {
    private readonly _code;
    private readonly _message;
    private readonly _stack?;
    get code(): TCode;
    get message(): string;
    get stack(): string | undefined;
    /**
     * @internal
     */
    constructor(code: TCode, message: string, stack?: string);
    toString(): string;
}
export declare class NitroPlayerComponentError extends NitroPlayerError<NitroPlayerViewError> {
}
export declare class NitroPlayerRuntimeError extends NitroPlayerError<LibraryError | PlayerError | SourceError | UnknownError> {
}
/**
 * Tries to parse an error coming from native to a typed JS video error.
 * @param {NitroPlayerError} nativeError The native error instance. This is a JSON in the legacy native module architecture.
 * @returns A {@linkcode NitroPlayerRuntimeError} or {@linkcode NitroPlayerComponentError}, or the `nativeError` itself if it's not parsable
 * @method
 */
export declare const tryParseNativeNitroPlayerError: <T>(nativeError: T) => (NitroPlayerRuntimeError | NitroPlayerComponentError) | T;
//# sourceMappingURL=NitroPlayerError.d.ts.map