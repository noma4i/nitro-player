"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NativeNitroPlayerView = void 0;
var _reactNative = require("react-native");
var _NitroPlayerViewNativeComponent = _interopRequireDefault(require("../../spec/fabric/NitroPlayerViewNativeComponent"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const LINKING_ERROR = `The package '@noma4i/nitro-play' doesn't seem to be linked. Make sure: \n\n` + _reactNative.Platform.select({
  ios: "- You have run 'pod install'\n",
  default: ''
}) + '- You rebuilt the app after installing the package\n' + '- You are not using Expo Go\n';
const ComponentName = 'RNCNitroPlayerView';
const NativeNitroPlayerView = exports.NativeNitroPlayerView = _reactNative.UIManager.hasViewManagerConfig?.(ComponentName) === true ? _NitroPlayerViewNativeComponent.default : () => {
  throw new Error(LINKING_ERROR);
};
//# sourceMappingURL=NativeNitroPlayerView.js.map