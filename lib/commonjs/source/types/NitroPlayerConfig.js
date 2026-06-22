"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SOURCE_TRANSPORT_MODES = exports.SOURCE_STARTUPS = exports.SOURCE_PREVIEW_MODES = exports.SOURCE_POLICIES = void 0;
var _typeHelpers = require("../../support/typeHelpers.js");
// Boundary enums crossing the Nitro native bridge must be explicit string-literal
// union aliases — Nitrogen rejects `typeof tuple[number]`. Each paired runtime tuple
// is the source of truth for validation; unionTuple() fails the build on any drift.

const SOURCE_STARTUPS = exports.SOURCE_STARTUPS = (0, _typeHelpers.unionTuple)()('eager', 'lazy');
const SOURCE_TRANSPORT_MODES = exports.SOURCE_TRANSPORT_MODES = (0, _typeHelpers.unionTuple)()('auto', 'direct', 'proxy');
const SOURCE_PREVIEW_MODES = exports.SOURCE_PREVIEW_MODES = (0, _typeHelpers.unionTuple)()('listener', 'always', 'manual');
const SOURCE_POLICIES = exports.SOURCE_POLICIES = (0, _typeHelpers.unionTuple)()('auto', 'feed', 'hero', 'thumbnail', 'manual');

// @internal
//# sourceMappingURL=NitroPlayerConfig.js.map