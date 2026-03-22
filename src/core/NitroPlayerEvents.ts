import type { ListenerSubscription, NitroPlayerEventEmitter } from '../spec/nitro/NitroPlayerEventEmitter.nitro';
import { ALL_PLAYER_EVENTS, type JSNitroPlayerEvents, type AllNitroPlayerEvents as PlayerEvents } from './types/Events';

export class NitroPlayerEvents {
  protected eventEmitter: NitroPlayerEventEmitter;
  protected jsEventListeners: {
    [K in keyof JSNitroPlayerEvents]?: Set<JSNitroPlayerEvents[K]>;
  } = {};

  protected readonly supportedEvents: (keyof PlayerEvents)[] = ALL_PLAYER_EVENTS;

  constructor(eventEmitter: NitroPlayerEventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  protected triggerJSEvent<Event extends keyof JSNitroPlayerEvents>(event: Event, ...params: Parameters<JSNitroPlayerEvents[Event]>): boolean {
    if (!this.jsEventListeners[event]) return false;
    this.jsEventListeners[event]?.forEach(fn => (fn as (...args: Parameters<JSNitroPlayerEvents[Event]>) => void)(...params));
    return true;
  }

  addEventListener<Event extends keyof PlayerEvents>(event: Event, callback: PlayerEvents[Event]): ListenerSubscription {
    switch (event) {
      case 'onError':
        this.jsEventListeners.onError ??= new Set();
        this.jsEventListeners.onError.add(callback as JSNitroPlayerEvents['onError']);
        return {
          remove: () => this.jsEventListeners.onError?.delete(callback as JSNitroPlayerEvents['onError'])
        };
      case 'onBandwidthUpdate':
        return this.eventEmitter.addOnBandwidthUpdateListener(callback as PlayerEvents['onBandwidthUpdate']);
      case 'onLoad':
        return this.eventEmitter.addOnLoadListener(callback as PlayerEvents['onLoad']);
      case 'onLoadStart':
        return this.eventEmitter.addOnLoadStartListener(callback as PlayerEvents['onLoadStart']);
      case 'onPlaybackState':
        return this.eventEmitter.addOnPlaybackStateListener(callback as PlayerEvents['onPlaybackState']);
      case 'onVolumeChange':
        return this.eventEmitter.addOnVolumeChangeListener(callback as PlayerEvents['onVolumeChange']);
      default:
        throw new Error(`[NitroPlay] Unsupported event: ${event}`);
    }
  }

  clearAllEvents() {
    this.jsEventListeners = {};
    this.eventEmitter.clearAllListeners();
  }
}
