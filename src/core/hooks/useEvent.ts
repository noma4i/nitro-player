import { useEffect, useRef } from 'react';
import { NitroPlayer } from '../NitroPlayer';
import { type AllNitroPlayerEvents } from '../types/Events';

/**
 * Attaches an event listener to a `NitroPlayer` instance for a specified event.
 *
 * @param player - The player to attach the event to
 * @param event - The name of the event to attach the callback to
 * @param callback - The callback for the event
 */
export const useEvent = <T extends keyof AllNitroPlayerEvents>(player: NitroPlayer | null | undefined, event: T, callback: AllNitroPlayerEvents[T]) => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!player) return;

    const subscription = player.addEventListener(event, ((...args: unknown[]) => {
      (callbackRef.current as (...a: unknown[]) => void)(...args);
    }) as AllNitroPlayerEvents[T]);

    return () => {
      subscription.remove();
    };
  }, [player, event]);
};
