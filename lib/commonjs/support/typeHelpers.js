"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.unionTuple = unionTuple;
/**
 * Compile-time guard that a runtime tuple enumerates exactly the members of a
 * string-literal union `T` (no missing members, no extras). Lets a single
 * runtime tuple act as the source of truth for validation while the union type
 * stays an explicit alias - required because Nitrogen rejects `typeof tuple[number]`
 * unions on the native bridge. Drift between the two fails the build.
 */
function unionTuple() {
  return (...members) => {
    return members;
  };
}
//# sourceMappingURL=typeHelpers.js.map