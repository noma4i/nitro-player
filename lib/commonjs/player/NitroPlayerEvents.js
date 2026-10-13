"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NitroPlayerEvents = void 0;
class NitroPlayerEvents {
  addEventListener(event, callback) {
    switch (event) {
      case 'onBandwidthUpdate':
        return this.eventEmitter.addOnBandwidthUpdateListener(callback);
      case 'onError':
        return this.eventEmitter.addOnErrorListener(callback);
      case 'onLoad':
        return this.eventEmitter.addOnLoadListener(callback);
      case 'onLoadStart':
        return this.eventEmitter.addOnLoadStartListener(callback);
      case 'onPlaybackState':
        return this.eventEmitter.addOnPlaybackStateListener(callback);
      case 'onPlaybackIntentIdled':
        return this.eventEmitter.addOnPlaybackIntentIdledListener(callback);
      case 'onVolumeChange':
        return this.eventEmitter.addOnVolumeChangeListener(callback);
      default:
        throw new Error(`[NitroPlay] Unsupported event: ${event}`);
    }
  }
}
exports.NitroPlayerEvents = NitroPlayerEvents;
//# sourceMappingURL=NitroPlayerEvents.js.map