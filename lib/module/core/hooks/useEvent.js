"use strict";

import { useEffect, useRef } from 'react';
/**
 * Attaches an event listener to a `NitroPlayer` instance for a specified event.
 *
 * @param player - The player to attach the event to
 * @param event - The name of the event to attach the callback to
 * @param callback - The callback for the event
 */
export const useEvent = (player, event, callback) => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useEffect(() => {
    if (!player) return;
    const subscription = player.addEventListener(event, (...args) => {
      callbackRef.current(...args);
    });
    return () => {
      subscription.remove();
    };
  }, [player, event]);
};
//# sourceMappingURL=useEvent.js.map