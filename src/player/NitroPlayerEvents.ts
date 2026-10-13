import type { ListenerSubscription, NitroPlayerEventEmitter } from '../bridge/nitro/NitroPlayerEventEmitter.nitro';
import type { AllNitroPlayerEvents as PlayerEvents } from './events';

export abstract class NitroPlayerEvents {
  protected abstract get eventEmitter(): NitroPlayerEventEmitter;

  addEventListener<Event extends keyof PlayerEvents>(event: Event, callback: PlayerEvents[Event]): ListenerSubscription {
    switch (event) {
      case 'onBandwidthUpdate':
        return this.eventEmitter.addOnBandwidthUpdateListener(callback as PlayerEvents['onBandwidthUpdate']);
      case 'onError':
        return this.eventEmitter.addOnErrorListener(callback as PlayerEvents['onError']);
      case 'onLoad':
        return this.eventEmitter.addOnLoadListener(callback as PlayerEvents['onLoad']);
      case 'onLoadStart':
        return this.eventEmitter.addOnLoadStartListener(callback as PlayerEvents['onLoadStart']);
      case 'onPlaybackState':
        return this.eventEmitter.addOnPlaybackStateListener(callback as PlayerEvents['onPlaybackState']);
      case 'onPlaybackIntentIdled':
        return this.eventEmitter.addOnPlaybackIntentIdledListener(callback as PlayerEvents['onPlaybackIntentIdled']);
      case 'onVolumeChange':
        return this.eventEmitter.addOnVolumeChangeListener(callback as PlayerEvents['onVolumeChange']);
      default:
        throw new Error(`[NitroPlay] Unsupported event: ${event}`);
    }
  }
}
