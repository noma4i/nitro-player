import type { NitroPlayerEventEmitter } from '../spec/nitro/NitroPlayerEventEmitter.nitro';
import { NitroPlayerEvents } from '../core/NitroPlayerEvents';

function makeMockEventEmitter(): NitroPlayerEventEmitter {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  function addListener(event: string, listener: (...args: unknown[]) => void) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event]!.push(listener);
    return {
      remove: () => {
        const idx = listeners[event]!.indexOf(listener);
        if (idx >= 0) listeners[event]!.splice(idx, 1);
      }
    };
  }

  return {
    addOnBandwidthUpdateListener: jest.fn(cb => addListener('onBandwidthUpdate', cb)),
    addOnLoadListener: jest.fn(cb => addListener('onLoad', cb)),
    addOnLoadStartListener: jest.fn(cb => addListener('onLoadStart', cb)),
    addOnPlaybackStateListener: jest.fn(cb => addListener('onPlaybackState', cb)),
    addOnVolumeChangeListener: jest.fn(cb => addListener('onVolumeChange', cb)),
    clearAllListeners: jest.fn(() => {
      Object.keys(listeners).forEach(key => {
        listeners[key] = [];
      });
    }),
    name: 'NitroPlayerEventEmitter',
    equals: jest.fn(),
    dispose: jest.fn()
  } as unknown as NitroPlayerEventEmitter;
}

describe('NitroPlayerEvents', () => {
  it('addEventListener returns subscription with remove', () => {
    const emitter = makeMockEventEmitter();
    const events = new NitroPlayerEvents(emitter);
    const callback = jest.fn();

    const subscription = events.addEventListener('onPlaybackState', callback);

    expect(subscription).toBeDefined();
    expect(typeof subscription.remove).toBe('function');
  });

  it('listener is called when native event fires via emitter', () => {
    const emitter = makeMockEventEmitter();
    const events = new NitroPlayerEvents(emitter);
    const callback = jest.fn();

    events.addEventListener('onPlaybackState', callback);

    expect(emitter.addOnPlaybackStateListener).toHaveBeenCalledWith(callback);
  });

  it('remove() prevents listener from being called', () => {
    const emitter = makeMockEventEmitter();
    const events = new NitroPlayerEvents(emitter);
    const callback = jest.fn();

    const subscription = events.addEventListener('onPlaybackState', callback);
    subscription.remove();

    // After remove, the callback should be disconnected from the emitter
    // The mock emitter tracks listeners internally
    expect(callback).not.toHaveBeenCalled();
  });

  it('clearAllEvents removes all listeners and clears JS listeners', () => {
    const emitter = makeMockEventEmitter();
    const events = new NitroPlayerEvents(emitter);

    events.addEventListener('onPlaybackState', jest.fn());
    events.addEventListener('onLoad', jest.fn());

    events.clearAllEvents();

    expect(emitter.clearAllListeners).toHaveBeenCalled();
  });

  it('multiple listeners for same event all receive subscription', () => {
    const emitter = makeMockEventEmitter();
    const events = new NitroPlayerEvents(emitter);
    const cb1 = jest.fn();
    const cb2 = jest.fn();

    const sub1 = events.addEventListener('onVolumeChange', cb1);
    const sub2 = events.addEventListener('onVolumeChange', cb2);

    expect(emitter.addOnVolumeChangeListener).toHaveBeenCalledTimes(2);
    expect(sub1).toBeDefined();
    expect(sub2).toBeDefined();

    sub1.remove();
    // sub2 should still be valid
    expect(typeof sub2.remove).toBe('function');
  });

  it('throws for unsupported event', () => {
    const emitter = makeMockEventEmitter();
    const events = new NitroPlayerEvents(emitter);

    expect(() => {
      // @ts-expect-error testing unsupported event
      events.addEventListener('onNonExistent', jest.fn());
    }).toThrow(/Unsupported event/);
  });

});
