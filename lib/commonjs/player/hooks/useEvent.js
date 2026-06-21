"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useEvent = void 0;
var _react = require("react");
/**
 * Attaches an event listener to a `NitroPlayer` instance for a specified event.
 *
 * @param player - The player to attach the event to
 * @param event - The name of the event to attach the callback to
 * @param callback - The callback for the event
 */
const useEvent = (player, event, callback) => {
  const callbackRef = (0, _react.useRef)(callback);
  callbackRef.current = callback;
  (0, _react.useEffect)(() => {
    if (!player) return;
    const subscription = player.addEventListener(event, (...args) => {
      callbackRef.current(...args);
    });
    return () => {
      subscription.remove();
    };
  }, [player, event]);
};
exports.useEvent = useEvent;
//# sourceMappingURL=useEvent.js.map