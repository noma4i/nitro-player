"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createUnavailableWarner = exports.createNativeNitroObject = void 0;
var _reactNativeNitroModules = require("react-native-nitro-modules");
const createNativeNitroObject = name => {
  try {
    return _reactNativeNitroModules.NitroModules.createHybridObject(name);
  } catch {
    return undefined;
  }
};
exports.createNativeNitroObject = createNativeNitroObject;
const createUnavailableWarner = name => {
  let didWarn = false;
  return () => {
    if (didWarn) return;
    didWarn = true;
    console.warn(`[${name}] NitroPlay native module is unavailable`);
  };
};
exports.createUnavailableWarner = createUnavailableWarner;
//# sourceMappingURL=nativeNitroObject.js.map