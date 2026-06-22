"use strict";

import { unionTuple } from "../../support/typeHelpers.js";

// Boundary enums crossing the Nitro native bridge must be explicit string-literal
// union aliases — Nitrogen rejects `typeof tuple[number]`. Each paired runtime tuple
// is the source of truth for validation; unionTuple() fails the build on any drift.

export const SOURCE_STARTUPS = unionTuple()('eager', 'lazy');
export const SOURCE_TRANSPORT_MODES = unionTuple()('auto', 'direct', 'proxy');
export const SOURCE_PREVIEW_MODES = unionTuple()('listener', 'always', 'manual');
export const SOURCE_POLICIES = unionTuple()('auto', 'feed', 'hero', 'thumbnail', 'manual');

// @internal
//# sourceMappingURL=NitroPlayerConfig.js.map