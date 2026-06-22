"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RETENTION_LEVELS = exports.PRELOAD_LEVELS = void 0;
var _typeHelpers = require("../../support/typeHelpers.js");
// Boundary enums crossing the Nitro native bridge must be explicit string-literal
// union aliases — Nitrogen rejects `typeof tuple[number]`. The paired runtime tuple
// is the source of truth for validation; unionTuple() fails the build on any drift.

const PRELOAD_LEVELS = exports.PRELOAD_LEVELS = (0, _typeHelpers.unionTuple)()('none', 'metadata', 'buffered');
const RETENTION_LEVELS = exports.RETENTION_LEVELS = (0, _typeHelpers.unionTuple)()('cold', 'metadata', 'hot');
//# sourceMappingURL=MemoryConfig.js.map