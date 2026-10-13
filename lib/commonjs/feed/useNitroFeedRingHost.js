"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useNitroFeedRingHost = useNitroFeedRingHost;
var _react = require("react");
var _FeedRingHostArbiter = require("./FeedRingHostArbiter.js");
const toDeclaredState = options => ({
  focused: options.focused,
  playbackAllowed: options.playbackAllowed ?? true,
  muted: options.muted,
  catalog: options.catalog,
  getViewport: options.getViewport
});

/**
 * Declarative feed ring host. The component publishes its state; the arbiter
 * owns activation, projection and recovery. All arbiter mutations happen in
 * the commit phase; render stays side-effect free.
 */
function useNitroFeedRingHost(options) {
  const {
    hostKey
  } = options;
  if (typeof __DEV__ !== 'undefined' && __DEV__ && options.context !== 'ring') {
    throw new Error(`useNitroFeedRingHost supports only the 'ring' context, got '${options.context}'`);
  }
  (0, _react.useLayoutEffect)(() => {
    _FeedRingHostArbiter.feedRingHostArbiter.registerHost(hostKey, toDeclaredState(options));
    return () => {
      _FeedRingHostArbiter.feedRingHostArbiter.unregisterHost(hostKey);
    };
  }, [hostKey]);
  (0, _react.useLayoutEffect)(() => {
    _FeedRingHostArbiter.feedRingHostArbiter.updateHost(hostKey, toDeclaredState(options));
  });
  const subscribe = (0, _react.useCallback)(listener => _FeedRingHostArbiter.feedRingHostArbiter.subscribe(hostKey, listener), [hostKey]);
  const getBinding = (0, _react.useCallback)(() => _FeedRingHostArbiter.feedRingHostArbiter.getBinding(hostKey), [hostKey]);
  const binding = (0, _react.useSyncExternalStore)(subscribe, getBinding, getBinding);
  const publishViewport = (0, _react.useCallback)(() => {
    _FeedRingHostArbiter.feedRingHostArbiter.publishViewport(hostKey);
  }, [hostKey]);
  const readSnapshot = (0, _react.useCallback)(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) {
      return null;
    }
    const ring = _FeedRingHostArbiter.feedRingHostArbiter.getBinding(hostKey)?.ring;
    if (!ring || ring.isReleased) {
      return null;
    }
    try {
      return ring.snapshot();
    } catch {
      return null;
    }
  }, [hostKey]);
  return {
    binding,
    isActive: binding !== null,
    publishViewport,
    readSnapshot
  };
}
//# sourceMappingURL=useNitroFeedRingHost.js.map