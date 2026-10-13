"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NitroPlaybackSurface = void 0;
var React = _interopRequireWildcard(require("react"));
var _useNitroPlayer = require("../player/hooks/useNitroPlayer.js");
var _prepareSource = require("../source/prepareSource.js");
var _NitroPlayerView = _interopRequireDefault(require("../view/NitroPlayerView.js"));
var _NitroPlaybackSurfaceSnapshot = require("./NitroPlaybackSurfaceSnapshot.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
var cache;
function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var r, c, a = Object.defineProperty, n = { __proto__: null, default: e }; if (Object(e) !== e) return n; if (cache || "function" != typeof WeakMap || (cache = new WeakMap()), cache) { if (cache.has(e)) return cache.get(e); cache.set(e, n); } for (c in e) "default" !== c && {}.hasOwnProperty.call(e, c) && ((r = a && Object.getOwnPropertyDescriptor(e, c)) && (r.get || r.set) ? a(n, c, r) : n[c] = e[c]); return n; }
const NitroPlaybackSurfaceComponent = /*#__PURE__*/React.forwardRef(({
  source,
  playbackKey,
  context,
  shouldPlay,
  active,
  visible,
  muted,
  loop,
  rate = 1,
  onAttached,
  onDetached,
  onSnapshotChange,
  onProgress,
  onLoad,
  onError,
  onEnd,
  onPlaybackIntentIdled,
  ...viewProps
}, ref) => {
  const preparedSource = (0, _prepareSource.prepareSource)(source);
  const player = (0, _useNitroPlayer.useNitroPlayer)(preparedSource);
  const viewRef = React.useRef(null);
  const snapshotRef = React.useRef((0, _NitroPlaybackSurfaceSnapshot.createNitroPlaybackSurfaceSnapshot)(playbackKey, preparedSource.identity.playbackKey));
  const playbackKeyRef = React.useRef(playbackKey);
  const sourcePlaybackKeyRef = React.useRef(preparedSource.identity.playbackKey);
  const endedRef = React.useRef(false);
  const callbacksRef = React.useRef({
    onAttached,
    onDetached,
    onSnapshotChange,
    onProgress,
    onLoad,
    onError,
    onEnd,
    onPlaybackIntentIdled
  });
  callbacksRef.current = {
    onAttached,
    onDetached,
    onSnapshotChange,
    onProgress,
    onLoad,
    onError,
    onEnd,
    onPlaybackIntentIdled
  };
  if (playbackKeyRef.current !== playbackKey || sourcePlaybackKeyRef.current !== preparedSource.identity.playbackKey) {
    const isSessionPlaybackKeyChanged = playbackKeyRef.current !== playbackKey;
    const previousSnapshot = snapshotRef.current;
    playbackKeyRef.current = playbackKey;
    sourcePlaybackKeyRef.current = preparedSource.identity.playbackKey;
    endedRef.current = false;
    const nextSnapshot = (0, _NitroPlaybackSurfaceSnapshot.createNitroPlaybackSurfaceSnapshot)(playbackKey, preparedSource.identity.playbackKey);
    snapshotRef.current = isSessionPlaybackKeyChanged ? nextSnapshot : {
      ...nextSnapshot,
      isAttached: previousSnapshot.isAttached
    };
  }
  const reduceSnapshot = React.useCallback(event => {
    const reduction = (0, _NitroPlaybackSurfaceSnapshot.reduceNitroPlaybackSurfaceSnapshot)(snapshotRef.current, event);
    snapshotRef.current = reduction.snapshot;
    if (reduction.shouldNotify) {
      callbacksRef.current.onSnapshotChange?.(reduction.snapshot);
    }
    return reduction.snapshot;
  }, []);
  React.useEffect(() => {
    player.configurePlayback(playbackKey, context, true);
  }, [player, playbackKey, context.group, context.priority, context.resume]);
  React.useEffect(() => {
    player.updatePlayback(active, visible, muted, loop);
  }, [active, loop, muted, player, visible]);
  React.useEffect(() => {
    player.rate = rate;
  }, [player, rate]);
  React.useEffect(() => {
    if (shouldPlay) {
      player.requestPlayback();
      return;
    }
    player.requestIdle();
  }, [player, shouldPlay]);
  React.useEffect(() => {
    callbacksRef.current.onSnapshotChange?.(snapshotRef.current);
  }, [playbackKey, preparedSource.identity.playbackKey]);
  React.useLayoutEffect(() => {
    snapshotRef.current = (0, _NitroPlaybackSurfaceSnapshot.createNitroPlaybackSurfaceSnapshot)(playbackKeyRef.current, sourcePlaybackKeyRef.current);
    endedRef.current = false;
  }, [player]);
  React.useEffect(() => {
    const subscriptions = [player.addEventListener('onPlaybackState', state => {
      const snapshot = reduceSnapshot({
        type: 'playbackState',
        state
      });
      callbacksRef.current.onProgress?.(state);
      const isEnded = snapshot.status === 'ended';
      if (isEnded && !endedRef.current) {
        callbacksRef.current.onEnd?.();
      }
      endedRef.current = isEnded;
    }), player.addEventListener('onLoad', data => {
      reduceSnapshot({
        type: 'load',
        data
      });
      callbacksRef.current.onLoad?.(data);
    }), player.addEventListener('onError', error => {
      reduceSnapshot({
        type: 'error',
        error
      });
      callbacksRef.current.onError?.(error);
    }), player.addEventListener('onPlaybackIntentIdled', () => {
      callbacksRef.current.onPlaybackIntentIdled?.();
    })];
    return () => {
      subscriptions.forEach(subscription => subscription.remove());
    };
  }, [player, reduceSnapshot]);
  React.useImperativeHandle(ref, () => ({
    seekTo: time => player.seekTo(time),
    replay: () => {
      player.seekTo(0);
      player.requestPlayback();
    },
    enterFullscreen: () => viewRef.current?.enterFullscreen(),
    exitFullscreen: () => viewRef.current?.exitFullscreen()
  }), [player]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_NitroPlayerView.default, {
    ref: viewRef,
    player: player,
    onAttached: () => {
      reduceSnapshot({
        type: 'attached',
        state: player.tryReadPlaybackState()
      });
      callbacksRef.current.onAttached?.();
    },
    onDetached: () => {
      reduceSnapshot({
        type: 'detached'
      });
      callbacksRef.current.onDetached?.();
    },
    ...viewProps
  });
});
NitroPlaybackSurfaceComponent.displayName = 'NitroPlaybackSurface';
const NitroPlaybackSurface = exports.NitroPlaybackSurface = /*#__PURE__*/React.memo(NitroPlaybackSurfaceComponent);
//# sourceMappingURL=NitroPlaybackSurface.js.map