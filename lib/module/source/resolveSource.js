"use strict";

import { isPreparedSource, prepareSource, resolveUri } from "./prepareSource.js";
/**
 * Normalizes a string-or-object source into `{ uri, headers }`. Shared by
 * streamCache and videoPreview so both resolve sources identically.
 */
export const resolveSource = (source, headers) => {
  if (typeof source === 'string') {
    return {
      uri: resolveUri(source),
      headers
    };
  }
  if (typeof source === 'number') {
    return {
      uri: resolveUri(source),
      headers
    };
  }
  if (isPlainUriHeadersSource(source)) {
    return {
      uri: resolveUri(source.uri),
      headers: source.headers
    };
  }
  const prepared = prepareSource(source);
  return {
    uri: prepared.uri,
    headers: prepared.headers
  };
};
const isPlainUriHeadersSource = source => {
  if (!source || typeof source !== 'object' || isPreparedSource(source) || !('uri' in source)) {
    return false;
  }
  return Object.keys(source).every(key => key === 'uri' || key === 'headers');
};
//# sourceMappingURL=resolveSource.js.map