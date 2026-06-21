import type { StreamHeaders } from '../streaming/types';
import { prepareSource } from './prepareSource';
import type { NitroSourceInput } from './types/NitroPlayerConfig';

export type ResolvableSource = NitroSourceInput | { uri: string; headers?: StreamHeaders };

/**
 * Normalizes a string-or-object source into `{ uri, headers }`. Shared by
 * streamCache and videoPreview so both resolve sources identically.
 */
export const resolveSource = (source: ResolvableSource, headers?: StreamHeaders): { uri: string; headers?: StreamHeaders } => {
  if (typeof source === 'string' && headers !== undefined) {
    return { uri: source, headers };
  }

  const prepared = prepareSource(source);
  return { uri: prepared.uri, headers: prepared.headers };
};
