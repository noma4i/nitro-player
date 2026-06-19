"use strict";

/**
 * Normalizes a string-or-object source into `{ uri, headers }`. Shared by
 * streamCache and videoPreview so both resolve sources identically.
 */
export const resolveSource = (source, headers) => typeof source === 'string' ? {
  uri: source,
  headers
} : source;
//# sourceMappingURL=resolveSource.js.map