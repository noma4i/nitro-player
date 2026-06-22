import { unionTuple } from '../../support/typeHelpers';

// Boundary enums crossing the Nitro native bridge must be explicit string-literal
// union aliases — Nitrogen rejects `typeof tuple[number]`. The paired runtime tuple
// is the source of truth for validation; unionTuple() fails the build on any drift.
export type PreloadLevel = 'none' | 'metadata' | 'buffered';
export const PRELOAD_LEVELS = unionTuple<PreloadLevel>()('none', 'metadata', 'buffered');

export type RetentionLevel = 'cold' | 'metadata' | 'hot';
export const RETENTION_LEVELS = unionTuple<RetentionLevel>()('cold', 'metadata', 'hot');
