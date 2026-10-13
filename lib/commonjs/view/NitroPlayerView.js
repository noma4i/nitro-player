"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var React = _interopRequireWildcard(require("react"));
var _reactNativeNitroModules = require("react-native-nitro-modules");
var _NitroPlayerError = require("../support/errors/NitroPlayerError.js");
var _NativeNitroPlayerView = require("./NativeNitroPlayerView.js");
var _jsxRuntime = require("react/jsx-runtime");
var cache;
function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var r, c, a = Object.defineProperty, n = { __proto__: null, default: e }; if (Object(e) !== e) return n; if (cache || "function" != typeof WeakMap || (cache = new WeakMap()), cache) { if (cache.has(e)) return cache.get(e); cache.set(e, n); } for (c in e) "default" !== c && {}.hasOwnProperty.call(e, c) && ((r = a && Object.getOwnPropertyDescriptor(e, c)) && (r.get || r.set) ? a(n, c, r) : n[c] = e[c]); return n; }
let nitroIdCounter = 1;
const nitroPlayerViewManagerFactory = _reactNativeNitroModules.NitroModules.createHybridObject('NitroPlayerViewManagerFactory');
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
const isViewNotFound = error => typeof error === 'object' && error !== null && 'code' in error && error.code === 'view/not-found';
const NitroPlayerViewSurface = /*#__PURE__*/React.forwardRef(({
  player,
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
  const nitroId = React.useMemo(() => nitroIdCounter++, []);
  const nitroViewManager = React.useRef(null);
  const [managerGeneration, setManagerGeneration] = React.useState(0);
  const [isAttached, setIsAttached] = React.useState(false);
  const lastDeliveredAttachStateRef = React.useRef(false);
  const setupViewManager = React.useCallback(id => {
    try {
      if (nitroViewManager.current === null) {
        const manager = nitroPlayerViewManagerFactory.createViewManager(id);
        if (!manager) {
          console.warn('[NitroPlay] NitroPlayerView native view disappeared before manager attach completed; waiting for the next native attach event.');
          return;
        }
        nitroViewManager.current = manager;
        setManagerGeneration(generation => generation + 1);
      }
      setIsAttached(nitroViewManager.current.isAttached);
    } catch (error) {
      const parsedError = (0, _NitroPlayerError.tryParseNativeNitroPlayerError)(error);
      if (isViewNotFound(parsedError)) {
        return;
      }
      throw parsedError;
    }
  }, []);
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
    setupViewManager(nitroId);
    return () => {
      if (nitroViewManager.current) {
        nitroViewManager.current.clearAllListeners();
      }
      nitroViewManager.current = null;
      lastDeliveredAttachStateRef.current = false;
    };
  }, [nitroId, setupViewManager]);
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
  }, [player, playerDefaults, controls, resizeMode, keepScreenAwake, surfaceType, managerGeneration]);
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
  }, [managerGeneration, onAttached, onDetached, onFullscreenChange, player, willEnterFullscreen, willExitFullscreen]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_NativeNitroPlayerView.NativeNitroPlayerView, {
    nitroId: nitroId,
    onNitroIdChange: onNitroIdChange,
    ...props
  });
});
const NitroPlayerView = /*#__PURE__*/React.forwardRef(({
  player,
  ...surfaceProps
}, ref) => {
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(NitroPlayerViewSurface, {
    ref: ref,
    player: player,
    ...surfaceProps
  });
});
NitroPlayerViewSurface.displayName = 'NitroPlayerViewSurface';
NitroPlayerView.displayName = 'NitroPlayerView';
var _default = exports.default = /*#__PURE__*/React.memo(NitroPlayerView);
//# sourceMappingURL=NitroPlayerView.js.map