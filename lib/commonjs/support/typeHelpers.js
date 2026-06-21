"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.allKeysOf = allKeysOf;
/**
 * Compile-time guard that an array enumerates exactly the keys of `T`
 * (no missing keys, no extras). Used to keep event registries in sync
 * with their event interfaces.
 */
function allKeysOf() {
  return (...arr) => {
    return arr;
  };
}
//# sourceMappingURL=typeHelpers.js.map