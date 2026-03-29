import type { ListenerSubscription, NitroPlayerEventEmitter } from '../spec/nitro/NitroPlayerEventEmitter.nitro';
import { ALL_PLAYER_EVENTS, type AllNitroPlayerEvents as PlayerEvents } from './types/Events';

export class NitroPlayerEvents {
  protected eventEmitter: NitroPlayerEventEmitter;
  protected readonly supportedEvents: (keyof PlayerEvents)[] = ALL_PLAYER_EVENTS;

  constructor(eventEmitter: NitroPlayerEventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  addEventListener<Event extends keyof PlayerEvents>(event: Event, callback: PlayerEvents[Event]): ListenerSubscription {
    switch (event) {
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
    this.eventEmitter.clearAllListeners();
  }
}
