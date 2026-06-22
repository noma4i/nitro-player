import type { NitroSourceConfig } from './types/NitroPlayerConfig';
import { SOURCE_POLICIES, SOURCE_PREVIEW_MODES, SOURCE_STARTUPS, SOURCE_TRANSPORT_MODES } from './types/NitroPlayerConfig';
import { PRELOAD_LEVELS, RETENTION_LEVELS } from '../player/types/MemoryConfig';
import { NitroPlayerRuntimeError } from '../support/errors/NitroPlayerError';

const VALID_STARTUP: ReadonlySet<string> = new Set(SOURCE_STARTUPS);
const VALID_PRELOAD: ReadonlySet<string> = new Set(PRELOAD_LEVELS);
const VALID_OFFSCREEN: ReadonlySet<string> = new Set(RETENTION_LEVELS);
const VALID_TRANSPORT_MODE: ReadonlySet<string> = new Set(SOURCE_TRANSPORT_MODES);
const VALID_PREVIEW_MODE: ReadonlySet<string> = new Set(SOURCE_PREVIEW_MODES);
const VALID_POLICY: ReadonlySet<string> = new Set(SOURCE_POLICIES);

const assertEnum = (value: unknown, valid: ReadonlySet<string>, field: string): void => {
  if (value !== undefined && (typeof value !== 'string' || !valid.has(value))) {
    throw new NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: ${String(value)}`);
  }
};

const assertObject = (value: unknown, field: string): void => {
  if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new NitroPlayerRuntimeError('player/invalid-source', `Invalid ${field}: expected an object`);
  }
};

export const validateSourceConfig = (config: NitroSourceConfig): void => {
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
