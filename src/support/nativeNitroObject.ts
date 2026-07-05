import { NitroModules } from 'react-native-nitro-modules';
import type { HybridObject } from 'react-native-nitro-modules';

export const createNativeNitroObject = <T extends HybridObject<{}>>(name: string): T | undefined => {
  try {
    return NitroModules.createHybridObject<T>(name);
  } catch {
    return undefined;
  }
};

export const createUnavailableWarner = (name: string) => {
  let didWarn = false;
  return () => {
    if (didWarn) return;
    didWarn = true;
    console.warn(`[${name}] NitroPlay native module is unavailable`);
  };
};
