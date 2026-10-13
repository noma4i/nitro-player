import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const prefetch = jest.fn();
const cancel = jest.fn();
let settled: ((uri: string) => void) | undefined;
const unsubscribe = jest.fn();

jest.mock('../../runtime/nativePlaybackRuntime', () => ({
  prefetchNitroPlaybackSource: (...args: unknown[]) => prefetch(...args),
  cancelNitroPlaybackPrefetch: (...args: unknown[]) => cancel(...args),
  addNitroPrefetchSettledListener: (listener: (uri: string) => void) => {
    settled = listener;
    return { remove: unsubscribe };
  }
}));

import { createNitroPrefetchQueue } from '../NitroPrefetchQueue';

const uri = (name: string) => `https://cdn.example/${name}.m3u8`;
const request = (name: string, priority: number, durationSeconds?: number) => ({
  key: name,
  source: { uri: uri(name) },
  priority,
  durationSeconds
});
const prefetchedUris = () => prefetch.mock.calls.map(call => (call[0] as { uri: string }).uri);

describe('NitroPrefetchQueue', () => {
  beforeEach(() => {
    prefetch.mockReset();
    cancel.mockReset();
    unsubscribe.mockReset();
    settled = undefined;
  });

  it('dispatches lowest priority value first and respects maxConcurrent', () => {
    const queue = createNitroPrefetchQueue({ maxConcurrent: 2 });

    queue.setWindow([request('c', 3), request('a', 1), request('b', 2)]);

    expect(prefetchedUris()).toEqual([uri('a'), uri('b')]);
    queue.dispose();
  });

  it('dispatches the next pending request when the native settled event arrives', () => {
    const queue = createNitroPrefetchQueue({ maxConcurrent: 1 });
    queue.setWindow([request('a', 1), request('b', 2)]);
    expect(prefetchedUris()).toEqual([uri('a')]);

    settled?.(uri('a'));

    expect(prefetchedUris()).toEqual([uri('a'), uri('b')]);
    queue.dispose();
  });

  it('cancels in-flight work that leaves the window and does not refetch completed work', () => {
    const queue = createNitroPrefetchQueue({ maxConcurrent: 1 });
    queue.setWindow([request('a', 1)]);

    queue.setWindow([request('b', 1)]);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(prefetchedUris()).toEqual([uri('a'), uri('b')]);

    settled?.(uri('b'));
    queue.setWindow([request('b', 1)]);
    expect(prefetchedUris()).toEqual([uri('a'), uri('b')]);
    queue.dispose();
  });

  it('skips non-http sources and unsubscribes on dispose', () => {
    const queue = createNitroPrefetchQueue();

    queue.setWindow([{ key: 'local', source: { uri: 'file:///local.mp4' }, priority: 1 }]);
    expect(prefetch).not.toHaveBeenCalled();

    queue.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    queue.setWindow([request('a', 1)]);
    expect(prefetch).not.toHaveBeenCalled();
  });
});
