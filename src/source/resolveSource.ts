import type { StreamHeaders } from '../streaming/types';

export type ResolvableSource = { uri: string; headers?: StreamHeaders } | string;

/**
 * Normalizes a string-or-object source into `{ uri, headers }`. Shared by
 * streamCache and videoPreview so both resolve sources identically.
 */
export const resolveSource = (source: ResolvableSource, headers?: StreamHeaders): { uri: string; headers?: StreamHeaders } =>
  typeof source === 'string' ? { uri: source, headers } : source;
