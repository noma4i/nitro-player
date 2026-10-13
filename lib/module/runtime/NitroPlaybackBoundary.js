"use strict";

import { createElement, Fragment, useLayoutEffect } from 'react';
import { suspendNitroPlayback } from "./nativePlaybackRuntime.js";
export function NitroPlaybackBoundary({
  children,
  suspended,
  allowGroups
}) {
  useLayoutEffect(() => {
    if (!suspended) {
      return;
    }
    const handle = suspendNitroPlayback('boundary', allowGroups);
    return () => {
      handle.release();
    };
  }, [suspended, allowGroups]);
  return /*#__PURE__*/createElement(Fragment, null, children);
}
//# sourceMappingURL=NitroPlaybackBoundary.js.map