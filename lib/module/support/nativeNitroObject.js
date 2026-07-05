"use strict";

import { NitroModules } from 'react-native-nitro-modules';
export const createNativeNitroObject = name => {
  try {
    return NitroModules.createHybridObject(name);
  } catch {
    return undefined;
  }
};
export const createUnavailableWarner = name => {
  let didWarn = false;
  return () => {
    if (didWarn) return;
    didWarn = true;
    console.warn(`[${name}] NitroPlay native module is unavailable`);
  };
};
//# sourceMappingURL=nativeNitroObject.js.map