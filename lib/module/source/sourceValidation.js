"use strict";

import { SOURCE_POLICIES, SOURCE_PREVIEW_MODES, SOURCE_STARTUPS, SOURCE_TRANSPORT_MODES } from "./types/NitroPlayerConfig.js";
import { PRELOAD_LEVELS, RETENTION_LEVELS } from "../player/types/MemoryConfig.js";
import { NitroPlayerRuntimeError } from "../support/errors/NitroPlayerError.js";
const VALID_STARTUP = new Set(SOURCE_STARTUPS);
const VALID_PRELOAD = new Set(PRELOAD_LEVELS);
const VALID_OFFSCREEN = new Set(RETENTION_LEVELS);
const VALID_TRANSPORT_MODE = new Set(SOURCE_TRANSPORT_MODES);
const VALID_PREVIEW_MODE = new Set(SOURCE_PREVIEW_MODES);
const VALID_POLICY = new Set(SOURCE_POLICIES);
const assertEnum = (value, valid, field) => {
  if (value !== undefined && (typeof value !== 'string' || !valid.has(value))) {
    throw new NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: ${String(value)}`);
  }
};
const assertObject = (value, field) => {
  if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: expected an object`);
  }
};
export const validateSourceConfig = config => {
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
//# sourceMappingURL=sourceValidation.js.map