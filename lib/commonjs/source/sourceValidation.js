"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.validateSourceConfig = void 0;
var _NitroPlayerError = require("../support/errors/NitroPlayerError.js");
const VALID_STARTUP = new Set(['eager', 'lazy']);
const VALID_PRELOAD = new Set(['none', 'metadata', 'buffered']);
const VALID_OFFSCREEN = new Set(['cold', 'metadata', 'hot']);
const VALID_TRANSPORT_MODE = new Set(['auto', 'direct', 'proxy']);
const VALID_PREVIEW_MODE = new Set(['listener', 'always', 'manual']);
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