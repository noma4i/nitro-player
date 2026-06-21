"use strict";

import { prepareSource } from "./prepareSource.js";
/**
 * Normalizes a string-or-object source into `{ uri, headers }`. Shared by
 * streamCache and videoPreview so both resolve sources identically.
 */
export const resolveSource = (source, headers) => {
  if (typeof source === 'string' && headers !== undefined) {
    return {
      uri: source,
      headers
    };
  }
  const prepared = prepareSource(source);
  return {
    uri: prepared.uri,
    headers: prepared.headers
  };
};
//# sourceMappingURL=resolveSource.js.map