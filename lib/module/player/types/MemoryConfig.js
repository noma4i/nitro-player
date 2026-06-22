"use strict";

import { unionTuple } from "../../support/typeHelpers.js";

// Boundary enums crossing the Nitro native bridge must be explicit string-literal
// union aliases — Nitrogen rejects `typeof tuple[number]`. The paired runtime tuple
// is the source of truth for validation; unionTuple() fails the build on any drift.

export const PRELOAD_LEVELS = unionTuple()('none', 'metadata', 'buffered');
export const RETENTION_LEVELS = unionTuple()('cold', 'metadata', 'hot');
//# sourceMappingURL=MemoryConfig.js.map