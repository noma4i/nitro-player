"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NitroPlayerEvents = void 0;
var _Events = require("./types/Events.js");
class NitroPlayerEvents {
  supportedEvents = _Events.ALL_PLAYER_EVENTS;
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
exports.NitroPlayerEvents = NitroPlayerEvents;
//# sourceMappingURL=NitroPlayerEvents.js.map