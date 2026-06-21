import { NativeModules } from 'react-native';

/**
 * Single accessor for the `NitroPlayStreamRuntime` legacy native module shared by
 * the stream cache and video preview surfaces. Callers cast to their own facade type.
 */
export const getNativeStreamRuntime = <T>(): T | undefined => NativeModules?.NitroPlayStreamRuntime as T | undefined;

/**
 * Builds a warn-once callback for when the native module is unavailable, so each
 * surface logs at most one warning instead of duplicating the guard logic.
 */
export const createUnavailableWarner = (tag: string): (() => void) => {
  let didWarn = false;
  return () => {
    if (didWarn) {
      return;
    }
    didWarn = true;
    console.warn(`[${tag}] Native module not available`);
  };
};
