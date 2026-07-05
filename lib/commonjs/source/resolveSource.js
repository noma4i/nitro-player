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
  if (typeof source === 'string') {
    return {
      uri: (0, _prepareSource.resolveUri)(source),
      headers
    };
  }
  if (typeof source === 'number') {
    return {
      uri: (0, _prepareSource.resolveUri)(source),
      headers
    };
  }
  if (isPlainUriHeadersSource(source)) {
    return {
      uri: (0, _prepareSource.resolveUri)(source.uri),
      headers: source.headers
    };
  }
  const prepared = (0, _prepareSource.prepareSource)(source);
  return {
    uri: prepared.uri,
    headers: prepared.headers
  };
};
exports.resolveSource = resolveSource;
const isPlainUriHeadersSource = source => {
  if (!source || typeof source !== 'object' || (0, _prepareSource.isPreparedSource)(source) || !('uri' in source)) {
    return false;
  }
  return Object.keys(source).every(key => key === 'uri' || key === 'headers');
};
//# sourceMappingURL=resolveSource.js.map