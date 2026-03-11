import type { ListenerSubscription, VideoPlayerEventEmitter } from '../spec/nitro/VideoPlayerEventEmitter.nitro';
import { ALL_PLAYER_EVENTS, type JSVideoPlayerEvents, type AllPlayerEvents as PlayerEvents } from './types/Events';

export class VideoPlayerEvents {
  protected eventEmitter: VideoPlayerEventEmitter;
  protected jsEventListeners: {
    [K in keyof JSVideoPlayerEvents]?: Set<JSVideoPlayerEvents[K]>;
  } = {};

  protected readonly supportedEvents: (keyof PlayerEvents)[] = ALL_PLAYER_EVENTS;

  constructor(eventEmitter: VideoPlayerEventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  protected triggerJSEvent<Event extends keyof JSVideoPlayerEvents>(event: Event, ...params: Parameters<JSVideoPlayerEvents[Event]>): boolean {
    if (!this.jsEventListeners[event]) return false;
    this.jsEventListeners[event]?.forEach(fn => (fn as (...args: Parameters<JSVideoPlayerEvents[Event]>) => void)(...params));
    return true;
  }

  addEventListener<Event extends keyof PlayerEvents>(event: Event, callback: PlayerEvents[Event]): ListenerSubscription {
    switch (event) {
      case 'onError':
        this.jsEventListeners.onError ??= new Set();
        this.jsEventListeners.onError.add(callback as JSVideoPlayerEvents['onError']);
        return {
          remove: () => this.jsEventListeners.onError?.delete(callback as JSVideoPlayerEvents['onError'])
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
        throw new Error(`[JustPlayer] Unsupported event: ${event}`);
    }
  }

  clearAllEvents() {
    this.jsEventListeners = {};
    this.eventEmitter.clearAllListeners();
  }
}
