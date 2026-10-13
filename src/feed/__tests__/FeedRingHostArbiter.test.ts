import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { FeedRingHostDeclaredState } from '../FeedRingHostArbiter';

type Projection = { catalog?: unknown; playbackIndex: number; playbackAllowed: boolean };
const rings: FakeRing[] = [];

class FakeRing {
  isReleased = false;
  ringToken = 1;
  applied: Projection[] = [];
  release = jest.fn(() => {
    this.isReleased = true;
  });
  constructor() {
    rings.push(this);
  }
  applyProjection(projection: Projection): void {
    this.applied.push(projection);
  }
  addCommandEventListener(): { remove: () => void } {
    return { remove: () => undefined };
  }
  snapshot(): null {
    return null;
  }
}

jest.mock('../NitroFeedRingPlayer', () => ({ NitroFeedRingPlayer: FakeRing }));
jest.mock('../../runtime/nativePlaybackRuntime', () => ({
  addNitroForegroundListener: () => ({ remove: () => undefined })
}));

const declared = (overrides: Partial<FeedRingHostDeclaredState> = {}): FeedRingHostDeclaredState => ({
  focused: true,
  playbackAllowed: true,
  muted: false,
  catalog: { revision: 1, items: [] },
  getViewport: () => ({ windowCenterIndex: 0, playbackIndex: 0 }),
  ...overrides
});

const loadArbiter = () => {
  let arbiter: typeof import('../FeedRingHostArbiter').feedRingHostArbiter | undefined;
  jest.isolateModules(() => {
    arbiter = (require('../FeedRingHostArbiter') as typeof import('../FeedRingHostArbiter')).feedRingHostArbiter;
  });
  return arbiter!;
};

describe('feedRingHostArbiter', () => {
  beforeEach(() => {
    rings.length = 0;
  });

  it('binds the ring to the most recently focused host only', () => {
    const arbiter = loadArbiter();

    arbiter.registerHost('a', declared());
    arbiter.registerHost('b', declared());

    expect(arbiter.getBinding('b')).not.toBeNull();
    expect(arbiter.getBinding('a')).toBeNull();
    expect(rings).toHaveLength(1);
  });

  it('projects the catalog once and then only viewport changes', () => {
    const arbiter = loadArbiter();
    let playbackIndex = 0;
    const state = declared({ getViewport: () => ({ windowCenterIndex: 0, playbackIndex }) });
    arbiter.registerHost('a', state);

    playbackIndex = 1;
    arbiter.publishViewport('a');

    const applied = rings[0].applied;
    expect(applied).toHaveLength(2);
    expect(applied[0].catalog).toBeDefined();
    expect(applied[1].catalog).toBeUndefined();
    expect(applied[1].playbackIndex).toBe(1);
  });

  it('rejects a playback index outside the prepared window without touching native', () => {
    const arbiter = loadArbiter();

    arbiter.registerHost('a', declared({ getViewport: () => ({ windowCenterIndex: 0, playbackIndex: 3 }) }));

    expect(rings[0].applied).toHaveLength(0);
    expect(arbiter.getDebugSnapshot().lastCommandError).toMatch(/prepared window/);
  });

  it('parks playback when the last host unregisters and releases only on releaseAll', () => {
    const arbiter = loadArbiter();
    arbiter.registerHost('a', declared());

    arbiter.unregisterHost('a');

    expect(rings[0].applied.at(-1)?.playbackAllowed).toBe(false);
    expect(rings[0].release).not.toHaveBeenCalled();

    arbiter.releaseAll();
    expect(rings[0].release).toHaveBeenCalledTimes(1);
  });
});
