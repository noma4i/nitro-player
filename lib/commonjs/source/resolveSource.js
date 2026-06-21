"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resolveSource = void 0;
var _prepareSource = require("./prepareSource.js");
/**
 * Normalizes a string-or-object source into `{ uri, headers }`. Shared by
 * streamCache and videoPreview so both resolve sources identically.
 */
const resolveSource = (source, headers) => {
  if (typeof source === 'string' && headers !== undefined) {
    return {
      uri: source,
      headers
    };
  }
  const prepared = (0, _prepareSource.prepareSource)(source);
  return {
    uri: prepared.uri,
    headers: prepared.headers
  };
};
exports.resolveSource = resolveSource;
//# sourceMappingURL=resolveSource.js.map