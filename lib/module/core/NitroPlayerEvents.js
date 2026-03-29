"use strict";

import { ALL_PLAYER_EVENTS } from "./types/Events.js";
export class NitroPlayerEvents {
  supportedEvents = ALL_PLAYER_EVENTS;
  constructor(eventEmitter) {
    this.eventEmitter = eventEmitter;
  }
  addEventListener(event, callback) {
    switch (event) {
      case 'onBandwidthUpdate':
        return this.eventEmitter.addOnBandwidthUpdateListener(callback);
      case 'onLoad':
        return this.eventEmitter.addOnLoadListener(callback);
      case 'onLoadStart':
        return this.eventEmitter.addOnLoadStartListener(callback);
      case 'onPlaybackState':
        return this.eventEmitter.addOnPlaybackStateListener(callback);
      case 'onVolumeChange':
        return this.eventEmitter.addOnVolumeChangeListener(callback);
      default:
        throw new Error(`[NitroPlay] Unsupported event: ${event}`);
    }
  }
  clearAllEvents() {
    this.eventEmitter.clearAllListeners();
  }
}
//# sourceMappingURL=NitroPlayerEvents.js.map