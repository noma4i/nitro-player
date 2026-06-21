export type LibraryError = 'library/deallocated' | 'library/application-context-not-found' | 'library/method-not-supported';
export type PlayerError = 'player/released' | 'player/not-initialized' | 'player/asset-not-initialized' | 'player/invalid-source' | 'player/invalid-track-url' | 'player/cancelled';
export type SourceError = 'source/invalid-uri' | 'source/missing-read-file-permission' | 'source/file-does-not-exist' | 'source/failed-to-initialize-asset' | 'source/unsupported-content-type' | 'source/cancelled';
export type NitroPlayerViewError = 'view/not-found' | 'view/deallocated' | 'view/picture-in-picture-not-supported';
export type UnknownError = 'unknown/unknown';
export type NitroPlayerErrorCode = LibraryError | PlayerError | SourceError | NitroPlayerViewError | UnknownError;
//# sourceMappingURL=codes.d.ts.map