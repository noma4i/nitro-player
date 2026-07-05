"use strict";

import * as React from 'react';
import { NitroModules } from 'react-native-nitro-modules';
import { tryParseNativeNitroPlayerError, NitroPlayerError } from "../support/errors/NitroPlayerError.js";
import { useNitroPlayer } from "../player/hooks/useNitroPlayer.js";
import { NativeNitroPlayerView } from "./NativeNitroPlayerView.js";
import { jsx as _jsx } from "react/jsx-runtime";
let nitroIdCounter = 1;
const NitroPlayerViewManagerFactory = NitroModules.createHybridObject('NitroPlayerViewManagerFactory');
const wrapNativeViewManagerFunction = (manager, func) => {
  try {
    if (manager === null) {
      throw new NitroPlayerError('view/not-found', 'View manager not found');
    }
    return func(manager);
  } catch (error) {
    throw tryParseNativeNitroPlayerError(error);
  }
};
const isViewNotFound = error => typeof error === 'object' && error !== null && 'code' in error && error.code === 'view/not-found';
const shallowEqualPlayerDefaults = (previous, next) => {
  if (previous === next) {
    return true;
  }
  if (!previous || !next) {
    return false;
  }
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  return previousKeys.length === nextKeys.length && previousKeys.every(key => Object.is(previous[key], next[key]));
};
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
  const [isManagerReady, setIsManagerReady] = React.useState(false);
  const [isAttached, setIsAttached] = React.useState(false);
  const lastDeliveredAttachStateRef = React.useRef(false);
  const onAttachedRef = React.useRef(onAttached);
  const onDetachedRef = React.useRef(onDetached);
  const onFullscreenChangeRef = React.useRef(onFullscreenChange);
  const willEnterFullscreenRef = React.useRef(willEnterFullscreen);
  const willExitFullscreenRef = React.useRef(willExitFullscreen);
  const lastPlayerDefaultsRef = React.useRef(undefined);
  const hasWrittenPlayerDefaultsRef = React.useRef(false);
  onAttachedRef.current = onAttached;
  onDetachedRef.current = onDetached;
  onFullscreenChangeRef.current = onFullscreenChange;
  willEnterFullscreenRef.current = willEnterFullscreen;
  willExitFullscreenRef.current = willExitFullscreen;
  const setupViewManager = React.useCallback(id => {
    try {
      if (nitroViewManager.current === null) {
        const manager = NitroPlayerViewManagerFactory.createViewManager(id);
        if (!manager) {
          console.warn('[NitroPlay] NitroPlayerView native view disappeared before manager attach completed; waiting for the next native attach event.');
          return;
        }
        nitroViewManager.current = manager;
      }
      setIsAttached(nitroViewManager.current.isAttached);
      setIsManagerReady(true);
    } catch (error) {
      const parsedError = tryParseNativeNitroPlayerError(error);
      if (isViewNotFound(parsedError)) {
        console.warn('[NitroPlay] NitroPlayerView native view disappeared before manager attach completed; waiting for the next native attach event.');
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
    return () => {
      if (nitroViewManager.current) {
        nitroViewManager.current.clearAllListeners();
      }
      nitroViewManager.current = null;
      lastDeliveredAttachStateRef.current = false;
      hasWrittenPlayerDefaultsRef.current = false;
      lastPlayerDefaultsRef.current = undefined;
    };
  }, []);
  React.useEffect(() => {
    if (!isManagerReady || !nitroViewManager.current) {
      return;
    }
    const subscriptions = [];
    const manager = nitroViewManager.current;
    subscriptions.push(manager.addOnAttachedListener(() => {
      setIsAttached(true);
      if (!lastDeliveredAttachStateRef.current) {
        lastDeliveredAttachStateRef.current = true;
        onAttachedRef.current?.(player);
      }
    }));
    subscriptions.push(manager.addOnDetachedListener(() => {
      setIsAttached(false);
      if (lastDeliveredAttachStateRef.current) {
        lastDeliveredAttachStateRef.current = false;
        onDetachedRef.current?.();
      }
    }));
    subscriptions.push(manager.addOnFullscreenChangeListener(fullscreen => onFullscreenChangeRef.current?.(fullscreen)));
    subscriptions.push(manager.addWillEnterFullscreenListener(() => willEnterFullscreenRef.current?.()));
    subscriptions.push(manager.addWillExitFullscreenListener(() => willExitFullscreenRef.current?.()));
    if (manager.isAttached && !lastDeliveredAttachStateRef.current) {
      lastDeliveredAttachStateRef.current = true;
      setIsAttached(true);
      onAttachedRef.current?.(player);
    }
    return () => {
      subscriptions.forEach(sub => sub.remove());
    };
  }, [isManagerReady, player]);
  React.useEffect(() => {
    if (!isManagerReady || !nitroViewManager.current) {
      return;
    }
    nitroViewManager.current.surfaceType = surfaceType;
  }, [isManagerReady, surfaceType]);
  React.useEffect(() => {
    if (!isManagerReady || !nitroViewManager.current) {
      return;
    }
    nitroViewManager.current.controls = controls;
  }, [controls, isManagerReady]);
  React.useEffect(() => {
    if (!isManagerReady || !nitroViewManager.current) {
      return;
    }
    nitroViewManager.current.resizeMode = resizeMode;
  }, [isManagerReady, resizeMode]);
  React.useEffect(() => {
    if (!isManagerReady || !nitroViewManager.current) {
      return;
    }
    nitroViewManager.current.keepScreenAwake = keepScreenAwake;
  }, [isManagerReady, keepScreenAwake]);
  React.useEffect(() => {
    if (!isManagerReady || !nitroViewManager.current) {
      return;
    }
    nitroViewManager.current.player = player.__getNativePlayer();
  }, [isManagerReady, player]);
  React.useEffect(() => {
    if (!isManagerReady || !nitroViewManager.current) {
      return;
    }
    if (hasWrittenPlayerDefaultsRef.current && shallowEqualPlayerDefaults(lastPlayerDefaultsRef.current, playerDefaults)) {
      return;
    }
    lastPlayerDefaultsRef.current = playerDefaults;
    hasWrittenPlayerDefaultsRef.current = true;
    if (playerDefaults) {
      nitroViewManager.current.setPlayerDefaults(playerDefaults);
    } else {
      nitroViewManager.current.clearPlayerDefaults();
    }
  }, [isManagerReady, playerDefaults]);
  return /*#__PURE__*/_jsx(NativeNitroPlayerView, {
    nitroId: nitroId,
    onNitroIdChange: onNitroIdChange,
    ...props
  });
});
const NitroPlayerViewWithSource = /*#__PURE__*/React.forwardRef(({
  source,
  ...surfaceProps
}, ref) => {
  const player = useNitroPlayer(source);
  return /*#__PURE__*/_jsx(NitroPlayerViewSurface, {
    ref: ref,
    player: player,
    ...surfaceProps
  });
});
const NitroPlayerView = /*#__PURE__*/React.forwardRef((props, ref) => {
  if ('player' in props && props.player) {
    const {
      player,
      ...surfaceProps
    } = props;
    return /*#__PURE__*/_jsx(NitroPlayerViewSurface, {
      ref: ref,
      player: player,
      ...surfaceProps
    });
  }
  const {
    source,
    ...surfaceProps
  } = props;
  return /*#__PURE__*/_jsx(NitroPlayerViewWithSource, {
    ref: ref,
    source: source,
    ...surfaceProps
  });
});
NitroPlayerViewSurface.displayName = 'NitroPlayerViewSurface';
NitroPlayerViewWithSource.displayName = 'NitroPlayerViewWithSource';
NitroPlayerView.displayName = 'NitroPlayerView';
const MemoizedNitroPlayerView = /*#__PURE__*/React.memo(NitroPlayerView);
export default MemoizedNitroPlayerView;
//# sourceMappingURL=NitroPlayerView.js.map