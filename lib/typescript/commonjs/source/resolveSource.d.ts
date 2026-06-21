import type { StreamHeaders } from '../streaming/types';
import type { NitroSourceInput } from './types/NitroPlayerConfig';
export type ResolvableSource = NitroSourceInput | {
    uri: string;
    headers?: StreamHeaders;
};
/**
 * Normalizes a string-or-object source into `{ uri, headers }`. Shared by
 * streamCache and videoPreview so both resolve sources identically.
 */
export declare const resolveSource: (source: ResolvableSource, headers?: StreamHeaders) => {
    uri: string;
    headers?: StreamHeaders;
};
//# sourceMappingURL=resolveSource.d.ts.map