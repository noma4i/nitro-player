"use strict";

import { Platform, UIManager } from 'react-native';
import NitroPlayerViewNativeComponent from '../../spec/fabric/NitroPlayerViewNativeComponent';
const LINKING_ERROR = `The package '@noma4i/nitro-play' doesn't seem to be linked. Make sure: \n\n` + Platform.select({
  ios: "- You have run 'pod install'\n",
  default: ''
}) + '- You rebuilt the app after installing the package\n' + '- You are not using Expo Go\n';
const ComponentName = 'RNCNitroPlayerView';
export const NativeNitroPlayerView = UIManager.hasViewManagerConfig?.(ComponentName) === true ? NitroPlayerViewNativeComponent : () => {
  throw new Error(LINKING_ERROR);
};
//# sourceMappingURL=NativeNitroPlayerView.js.map