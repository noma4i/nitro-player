"use strict";

/**
 * Compile-time guard that an array enumerates exactly the keys of `T`
 * (no missing keys, no extras). Used to keep event registries in sync
 * with their event interfaces.
 */
export function allKeysOf() {
  return (...arr) => {
    return arr;
  };
}
//# sourceMappingURL=typeHelpers.js.map