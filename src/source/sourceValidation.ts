import type { NitroSourceConfig } from './types/NitroPlayerConfig';
import { NitroPlayerRuntimeError } from '../support/errors/NitroPlayerError';

const VALID_STARTUP: ReadonlySet<string> = new Set(['eager', 'lazy']);
const VALID_PRELOAD: ReadonlySet<string> = new Set(['none', 'metadata', 'buffered']);
const VALID_OFFSCREEN: ReadonlySet<string> = new Set(['cold', 'metadata', 'hot']);
const VALID_TRANSPORT_MODE: ReadonlySet<string> = new Set(['auto', 'direct', 'proxy']);
const VALID_PREVIEW_MODE: ReadonlySet<string> = new Set(['listener', 'always', 'manual']);

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
