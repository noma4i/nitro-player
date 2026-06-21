import {
  CONSUMER_FEED_ITEMS,
  CONSUMER_PAGE_SIZE,
  CONSUMER_PREFETCH_WINDOW,
  FEED_SOURCES,
  HERO_SOURCES,
  buildConsumerCardSource,
  getActiveWindow,
  getVisibleConsumerItems,
  isHlsManifestSource,
  toStreamRuntimeSource,
} from '../scenarioModel';

describe('Example App scenario model', () => {
  it('covers hero playback modes used by the lab', () => {
    expect(HERO_SOURCES.startupProxy.source).toEqual(
      expect.objectContaining({
        policy: 'feed',
        preview: expect.objectContaining({ mode: 'always' }),
      })
    );
    expect(HERO_SOURCES.profileStream.source).toEqual(
      expect.objectContaining({
        headers: { 'X-Nitro-Scenario': 'profile-feed' },
        policy: 'feed',
        preview: expect.objectContaining({ mode: 'listener' }),
      })
    );
    expect(HERO_SOURCES.directMp4.source).toEqual(
      expect.objectContaining({
        policy: 'thumbnail',
        transport: { mode: 'direct' },
        retention: expect.objectContaining({ preload: 'metadata', offscreen: 'hot', feedPoolEligible: false }),
        preview: expect.objectContaining({ mode: 'manual' }),
      })
    );
  });

  it('keeps same-HLS feed sources isolated by harmless headers', () => {
    const hlsFeedSources = FEED_SOURCES.map(item => item.source).filter(isHlsManifestSource).map(toStreamRuntimeSource);

    expect(hlsFeedSources).toHaveLength(2);
    expect(hlsFeedSources[0]).toEqual(expect.objectContaining({ headers: { 'X-Nitro-Scenario': 'profile-feed' } }));
    expect(hlsFeedSources[1]).toEqual(expect.objectContaining({ headers: { 'X-Nitro-Scenario': 'creator-feed' } }));
    expect(hlsFeedSources[0]?.uri).toBe(hlsFeedSources[1]?.uri);
  });

  it('models page append and active-window prefetch without mounting cold rows', () => {
    const visiblePageOne = getVisibleConsumerItems(0);
    const visiblePageTwo = getVisibleConsumerItems(1);

    expect(visiblePageOne).toHaveLength(CONSUMER_PAGE_SIZE);
    expect(visiblePageTwo).toHaveLength(CONSUMER_PAGE_SIZE * 2);

    const activeWindow = getActiveWindow(visiblePageTwo, 3, CONSUMER_PREFETCH_WINDOW);
    expect(activeWindow.map(item => item.key)).toEqual(['page-1-direct', 'page-2-home-copy', 'page-2-topic-header']);
    expect(activeWindow.filter(item => isHlsManifestSource(item.source)).map(item => item.key)).toEqual(['page-2-home-copy', 'page-2-topic-header']);
  });

  it('builds active and pooled card sources with distance policy while preserving source overrides', () => {
    const active = buildConsumerCardSource(CONSUMER_FEED_ITEMS[0], 0, true);
    const pooled = buildConsumerCardSource(CONSUMER_FEED_ITEMS[4], 4, false);

    expect(active).toEqual(
      expect.objectContaining({
        policy: 'hero',
        retention: expect.objectContaining({ preload: 'buffered', offscreen: 'hot', feedPoolEligible: true }),
        preview: expect.objectContaining({ mode: 'listener', maxWidth: 512, maxHeight: 512 }),
        metadata: expect.objectContaining({ title: 'Page 1 Home Stream', subtitle: 'page 1, row 1' }),
      })
    );

    expect(pooled).toEqual(
      expect.objectContaining({
        policy: 'feed',
        headers: { 'X-Nitro-Scenario': 'topic-feed' },
        retention: expect.objectContaining({ preload: 'metadata', offscreen: 'metadata', trimDelayMs: 6000, feedPoolEligible: true }),
        preview: expect.objectContaining({ mode: 'listener' }),
        metadata: expect.objectContaining({ title: 'Page 2 Topic Stream', subtitle: 'page 2, row 5' }),
      })
    );
  });
});
