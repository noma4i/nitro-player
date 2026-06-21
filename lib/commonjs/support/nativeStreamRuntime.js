"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getNativeStreamRuntime = exports.createUnavailableWarner = void 0;
var _reactNative = require("react-native");
/**
 * Single accessor for the `NitroPlayStreamRuntime` legacy native module shared by
 * the stream cache and video preview surfaces. Callers cast to their own facade type.
 */
const getNativeStreamRuntime = () => _reactNative.NativeModules?.NitroPlayStreamRuntime;

/**
 * Builds a warn-once callback for when the native module is unavailable, so each
 * surface logs at most one warning instead of duplicating the guard logic.
 */
exports.getNativeStreamRuntime = getNativeStreamRuntime;
const createUnavailableWarner = tag => {
  let didWarn = false;
  return () => {
    if (didWarn) {
      return;
    }
    didWarn = true;
    console.warn(`[${tag}] Native module not available`);
  };
};
exports.createUnavailableWarner = createUnavailableWarner;
//# sourceMappingURL=nativeStreamRuntime.js.map