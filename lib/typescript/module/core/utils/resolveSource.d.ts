import type { StreamHeaders } from '../../transport/types';
export type ResolvableSource = {
    uri: string;
    headers?: StreamHeaders;
} | string;
/**
 * Normalizes a string-or-object source into `{ uri, headers }`. Shared by
 * streamCache and videoPreview so both resolve sources identically.
 */
export declare const resolveSource: (source: ResolvableSource, headers?: StreamHeaders) => {
    uri: string;
    headers?: StreamHeaders;
};
//# sourceMappingURL=resolveSource.d.ts.map