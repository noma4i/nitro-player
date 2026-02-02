import { Platform, UIManager } from 'react-native';

import VideoViewNativeComponent from '../../spec/fabric/VideoViewNativeComponent';

const LINKING_ERROR =
  `The package '@noma4i/just-player' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const ComponentName = 'RNCVideoView';

export const NativeVideoView =
  UIManager.hasViewManagerConfig?.(ComponentName) === true
    ? VideoViewNativeComponent
    : () => {
        throw new Error(LINKING_ERROR);
      };
