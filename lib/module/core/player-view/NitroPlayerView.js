"use strict";

import * as React from 'react';
import { NitroModules } from 'react-native-nitro-modules';
import { tryParseNativeNitroPlayerError, NitroPlayerComponentError, NitroPlayerError } from "../types/NitroPlayerError.js";
import { useNitroPlayer } from "../hooks/useNitroPlayer.js";
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
  const player = useNitroPlayer(source);
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
          throw new NitroPlayerError('view/not-found', 'Failed to create View Manager');
        }
      }
      setIsAttached(nitroViewManager.current.isAttached);
      setIsManagerReady(true);
    } catch (error) {
      const parsedError = tryParseNativeNitroPlayerError(error);
      if (parsedError instanceof NitroPlayerComponentError && parsedError.code === 'view/not-found' && !isMountedRef.current) {
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
  return /*#__PURE__*/_jsx(NativeNitroPlayerView, {
    nitroId: nitroId,
    onNitroIdChange: onNitroIdChange,
    ...props
  });
});
NitroPlayerView.displayName = 'NitroPlayerView';
export default /*#__PURE__*/React.memo(NitroPlayerView);
//# sourceMappingURL=NitroPlayerView.js.map