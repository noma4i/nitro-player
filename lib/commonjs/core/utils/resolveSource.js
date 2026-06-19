"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resolveSource = void 0;
/**
 * Normalizes a string-or-object source into `{ uri, headers }`. Shared by
 * streamCache and videoPreview so both resolve sources identically.
 */
const resolveSource = (source, headers) => typeof source === 'string' ? {
  uri: source,
  headers
} : source;
exports.resolveSource = resolveSource;
//# sourceMappingURL=resolveSource.js.map