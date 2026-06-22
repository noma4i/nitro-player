"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.validateSourceConfig = void 0;
var _NitroPlayerConfig = require("./types/NitroPlayerConfig.js");
var _MemoryConfig = require("../player/types/MemoryConfig.js");
var _NitroPlayerError = require("../support/errors/NitroPlayerError.js");
const VALID_STARTUP = new Set(_NitroPlayerConfig.SOURCE_STARTUPS);
const VALID_PRELOAD = new Set(_MemoryConfig.PRELOAD_LEVELS);
const VALID_OFFSCREEN = new Set(_MemoryConfig.RETENTION_LEVELS);
const VALID_TRANSPORT_MODE = new Set(_NitroPlayerConfig.SOURCE_TRANSPORT_MODES);
const VALID_PREVIEW_MODE = new Set(_NitroPlayerConfig.SOURCE_PREVIEW_MODES);
const VALID_POLICY = new Set(_NitroPlayerConfig.SOURCE_POLICIES);
const assertEnum = (value, valid, field) => {
  if (value !== undefined && (typeof value !== 'string' || !valid.has(value))) {
    throw new _NitroPlayerError.NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: ${String(value)}`);
  }
};
const assertObject = (value, field) => {
  if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new _NitroPlayerError.NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: expected an object`);
  }
};
const validateSourceConfig = config => {
  assertEnum(config.policy, VALID_POLICY, 'policy');
  assertEnum(config.startup, VALID_STARTUP, 'startup');
  assertObject(config.headers, 'headers');
  assertObject(config.metadata, 'metadata');
  assertObject(config.buffer, 'buffer');
  assertObject(config.retention, 'retention');
  assertEnum(config.retention?.preload, VALID_PRELOAD, 'retention.preload');
  assertEnum(config.retention?.offscreen, VALID_OFFSCREEN, 'retention.offscreen');
  assertObject(config.transport, 'transport');
  assertEnum(config.transport?.mode, VALID_TRANSPORT_MODE, 'transport.mode');
  assertObject(config.preview, 'preview');
  assertEnum(config.preview?.mode, VALID_PREVIEW_MODE, 'preview.mode');
};
exports.validateSourceConfig = validateSourceConfig;
//# sourceMappingURL=sourceValidation.js.map