"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var React = _interopRequireWildcard(require("react"));
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _NitroPlayerError = require("../types/NitroPlayerError.js");
var _useNitroPlayer = require("../hooks/useNitroPlayer.js");
var _NativeNitroPlayerView = require("./NativeNitroPlayerView.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
let nitroIdCounter = 1;
const NitroPlayerViewManagerFactory = _reactNativeNitroModules.NitroModules.createHybridObject('NitroPlayerViewManagerFactory');
const wrapNativeViewManagerFunction = (manager, func) => {
  try {
    if (manager === null) {
      throw new _NitroPlayerError.NitroPlayerError('view/not-found', 'View manager not found');
    }
    return func(manager);
  } catch (error) {
    throw (0, _NitroPlayerError.tryParseNativeNitroPlayerError)(error);
  }
};
const updateNativeProps = (manager, player, defaults, props) => {
  manager.surfaceType = props.surfaceType ?? 'surface';
  manager.controls = props.controls ?? false;
  manager.resizeMode = props.resizeMode ?? 'none';
  manager.keepScreenAwake = props.keepScreenAwake ?? true;
  if (defaults) {
    manager.setPlayerDefaults(defaults);
  } else {
    manager.clearPlayerDefaults();
  }
  manager.player = player.__getNativePlayer();
};
const NitroPlayerView = /*#__PURE__*/React.forwardRef(({
  source,
  playerDefaults,
  controls = false,
  resizeMode = 'none',
  keepScreenAwake = true,
  surfaceType = 'surface',
  onAttached,
  onDetached,
  onFullscreenChange,
  willEnterFullscreen,
  willExitFullscreen,
  ...props
}, ref) => {
  const player = (0, _useNitroPlayer.useNitroPlayer)(source);
  const nitroId = React.useMemo(() => nitroIdCounter++, []);
  const nitroViewManager = React.useRef(null);
  const isMountedRef = React.useRef(true);
  const [isManagerReady, setIsManagerReady] = React.useState(false);
  const [isAttached, setIsAttached] = React.useState(false);
  const lastDeliveredAttachStateRef = React.useRef(false);
  const setupViewManager = React.useCallback(id => {
    try {
      if (nitroViewManager.current === null) {
        nitroViewManager.current = NitroPlayerViewManagerFactory.createViewManager(id);
        if (!nitroViewManager.current) {
          throw new _NitroPlayerError.NitroPlayerError('view/not-found', 'Failed to create View Manager');
        }
      }
      setIsAttached(nitroViewManager.current.isAttached);
      setIsManagerReady(true);
    } catch (error) {
      const parsedError = (0, _NitroPlayerError.tryParseNativeNitroPlayerError)(error);
      if (parsedError instanceof _NitroPlayerError.NitroPlayerComponentError && parsedError.code === 'view/not-found' && !isMountedRef.current) {
        console.warn('[NitroPlay] NitroPlayerView was unmounted before native manager was able to find it.');
        return;
      }
      throw parsedError;
    }
  }, [nitroId]);
  const onNitroIdChange = React.useCallback(event => {
    setupViewManager(event.nativeEvent.nitroId);
  }, [setupViewManager]);
  React.useImperativeHandle(ref, () => ({
    player,
    isAttached,
    enterFullscreen: () => {
      wrapNativeViewManagerFunction(nitroViewManager.current, manager => {
        manager.enterFullscreen();
      });
    },
    exitFullscreen: () => {
      wrapNativeViewManagerFunction(nitroViewManager.current, manager => {
        manager.exitFullscreen();
      });
    },
    addEventListener: (event, callback) => {
      return wrapNativeViewManagerFunction(nitroViewManager.current, manager => {
        switch (event) {
          case 'onAttached':
            return manager.addOnAttachedListener(() => {
              callback(player);
            });
          case 'onDetached':
            return manager.addOnDetachedListener(callback);
          case 'onFullscreenChange':
            return manager.addOnFullscreenChangeListener(callback);
          case 'willEnterFullscreen':
            return manager.addWillEnterFullscreenListener(callback);
          case 'willExitFullscreen':
            return manager.addWillExitFullscreenListener(callback);
          default:
            throw new Error(`[NitroPlay] Unsupported event: ${event}`);
        }
      });
    }
  }), [isAttached, player]);
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (nitroViewManager.current) {
        nitroViewManager.current.clearAllListeners();
      }
      lastDeliveredAttachStateRef.current = false;
    };
  }, []);
  React.useEffect(() => {
    if (!nitroViewManager.current) {
      return;
    }
    const subscriptions = [];
    const manager = nitroViewManager.current;
    subscriptions.push(manager.addOnAttachedListener(() => {
      setIsAttached(true);
      if (!lastDeliveredAttachStateRef.current) {
        lastDeliveredAttachStateRef.current = true;
        onAttached?.(player);
      }
    }));
    subscriptions.push(manager.addOnDetachedListener(() => {
      setIsAttached(false);
      if (lastDeliveredAttachStateRef.current) {
        lastDeliveredAttachStateRef.current = false;
        onDetached?.();
      }
    }));
    if (onFullscreenChange) {
      subscriptions.push(manager.addOnFullscreenChangeListener(onFullscreenChange));
    }
    if (willEnterFullscreen) {
      subscriptions.push(manager.addWillEnterFullscreenListener(willEnterFullscreen));
    }
    if (willExitFullscreen) {
      subscriptions.push(manager.addWillExitFullscreenListener(willExitFullscreen));
    }
    if (manager.isAttached && !lastDeliveredAttachStateRef.current) {
      lastDeliveredAttachStateRef.current = true;
      setIsAttached(true);
      onAttached?.(player);
    }
    return () => {
      subscriptions.forEach(sub => sub.remove());
    };
  }, [isManagerReady, onAttached, onDetached, onFullscreenChange, player, willEnterFullscreen, willExitFullscreen]);
  React.useEffect(() => {
    if (!nitroViewManager.current) {
      return;
    }
    updateNativeProps(nitroViewManager.current, player, playerDefaults, {
      controls,
      resizeMode,
      keepScreenAwake,
      surfaceType
    });
  }, [player, playerDefaults, controls, resizeMode, keepScreenAwake, surfaceType, isManagerReady]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_NativeNitroPlayerView.NativeNitroPlayerView, {
    nitroId: nitroId,
    onNitroIdChange: onNitroIdChange,
    ...props
  });
});
NitroPlayerView.displayName = 'NitroPlayerView';
var _default = exports.default = /*#__PURE__*/React.memo(NitroPlayerView);
//# sourceMappingURL=NitroPlayerView.js.map