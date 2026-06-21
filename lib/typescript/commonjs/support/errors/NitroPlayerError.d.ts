import type { LibraryError, NitroPlayerErrorCode, NitroPlayerViewError, PlayerError, SourceError, UnknownError } from './codes';
export * from './codes';
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