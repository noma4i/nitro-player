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
/**
 * Compile-time guard that a runtime tuple enumerates exactly the members of a
 * string-literal union `T` (no missing members, no extras). Lets a single
 * runtime tuple act as the source of truth for validation while the union type
 * stays an explicit alias — required because Nitrogen rejects `typeof tuple[number]`
 * unions on the native bridge. Drift between the two fails the build.
 */
export function unionTuple() {
  return (...members) => {
    return members;
  };
}
//# sourceMappingURL=typeHelpers.js.map