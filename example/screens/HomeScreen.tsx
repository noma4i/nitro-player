import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import {
  streamCache,
  videoPreview,
  type NitroSourceConfig,
  type StreamCacheStats,
  type StreamSourceCacheStats,
} from '@noma4i/nitro-play';
import {
  CONSUMER_FEED_ITEMS,
  CONSUMER_PAGE_SIZE,
  CONSUMER_PREFETCH_WINDOW,
  FEED_SOURCES,
  HERO_SOURCES,
  HLS_URL,
  getActiveWindow,
  getVisibleConsumerItems,
  isHlsManifestSource,
  toStreamRuntimeSource,
} from '../scenarioModel';
import {
  ActionButton,
  ChipButton,
  ConsumerFeedCard,
  EMPTY_CACHE_STATS,
  EMPTY_SOURCE_CACHE_STATS,
  Metric,
  PlayerWorkbench,
  SectionTitle,
  formatBytes,
  styles,
  truncate,
} from '../shared';

const SCREEN_KEY = 'home';

type HeroSourceKey = keyof typeof HERO_SOURCES;

// HomeScreen keeps the original example sections (hero playback, feed stress,
// paged consumer lab) reachable as the default screen.
export function HomeScreen() {
  const [activeHeroKey, setActiveHeroKey] = useState<HeroSourceKey>('directMp4');
  const [globalCacheStats, setGlobalCacheStats] = useState<StreamCacheStats>(EMPTY_CACHE_STATS);
  const [sourceCacheStats, setSourceCacheStats] = useState<StreamSourceCacheStats>(EMPTY_SOURCE_CACHE_STATS);
  const [manualPreviewUri, setManualPreviewUri] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('idle');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const activeHero = HERO_SOURCES[activeHeroKey];

  const refreshStats = async (source: NitroSourceConfig) => {
    const [globalStats, perSourceStats] = await Promise.all([
      streamCache.getStats(),
      streamCache.getStats({ uri: source.uri as string, headers: source.headers }),
    ]);
    setGlobalCacheStats(globalStats as StreamCacheStats);
    setSourceCacheStats(perSourceStats as StreamSourceCacheStats);
  };

  useEffect(() => {
    setManualPreviewUri(null);
    setActionMessage(`active source: ${activeHero.label}`);
    refreshStats(activeHero.source).catch(() => {
      setGlobalCacheStats(EMPTY_CACHE_STATS);
      setSourceCacheStats(EMPTY_SOURCE_CACHE_STATS);
    });
  }, [activeHero]);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusyAction(label);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionMessage(`${label}: ${message}`);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>NitroPlay Example Lab</Text>
      <Text style={styles.headline}>Playback, stream cache, preview generation, and paged feed reuse in one screen.</Text>

      <SectionTitle title="Hero Playback" subtitle="Switch one surface across direct preview, HLS proxy, and header-scoped stream modes." />

      <View style={styles.selectorRow}>
        {Object.values(HERO_SOURCES).map(item => (
          <ChipButton
            key={item.key}
            label={item.label}
            active={item.key === activeHeroKey}
            testID={`${SCREEN_KEY}-hero-${item.key}`}
            onPress={() => setActiveHeroKey(item.key as HeroSourceKey)}
          />
        ))}
      </View>

      <PlayerWorkbench
        title={activeHero.label}
        chip={activeHero.chip}
        description={activeHero.note}
        source={activeHero.source}
        accent="#4cb3ff"
        testID={`${SCREEN_KEY}-hero`}
      />

      <UtilityPanel
        source={activeHero.source}
        busyAction={busyAction}
        actionMessage={actionMessage}
        globalCacheStats={globalCacheStats}
        sourceCacheStats={sourceCacheStats}
        manualPreviewUri={manualPreviewUri}
        onPrefetch={() =>
          runAction('prefetch stream', async () => {
            if (!isHlsManifestSource(activeHero.source)) {
              await refreshStats(activeHero.source);
              setActionMessage('stream prefetch skipped for direct source');
              return;
            }
            await streamCache.prefetch(activeHero.source);
            await refreshStats(activeHero.source);
            setActionMessage('stream prefetch complete');
          })
        }
        onRefreshStats={() =>
          runAction('stats', async () => {
            await refreshStats(activeHero.source);
            setActionMessage('stats refreshed');
          })
        }
        onFetchPreview={() =>
          runAction('generate preview', async () => {
            const next = await videoPreview.getFirstFrame(activeHero.source);
            setManualPreviewUri(next);
            setActionMessage(next ? 'preview image ready' : 'preview unavailable');
          })
        }
        onClearPreview={() =>
          runAction('preview clear', async () => {
            const ok = await videoPreview.clear();
            if (ok) {
              setManualPreviewUri(null);
            }
            setActionMessage(ok ? 'preview cache cleared' : 'preview cache clear failed');
          })
        }
        onClearStreamCache={() =>
          runAction('cache clear', async () => {
            const ok = await streamCache.clear();
            await refreshStats(activeHero.source);
            setActionMessage(ok ? 'stream cache cleared' : 'stream cache clear failed');
          })
        }
      />

      <SectionTitle
        title="Feed Stress"
        subtitle="Three players mounted together: reusable HLS feed streams plus direct MP4 preview."
      />

      <View style={styles.feedColumn}>
        {FEED_SOURCES.map(item => (
          <PlayerWorkbench
            key={item.key}
            title={item.title}
            chip={item.key}
            description={item.description}
            source={item.source}
            accent={item.tone}
            testID={`${SCREEN_KEY}-${item.key}`}
            compact
          />
        ))}
      </View>

      <SectionTitle
        title="Paged Consumer Lab"
        subtitle="Consumer-like page append, active window mounting, stream prefetch, preview warmup, and source reuse."
      />

      <PagedConsumerLab />
    </ScrollView>
  );
}

function PagedConsumerLab() {
  const [pageIndex, setPageIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [poolRadius, setPoolRadius] = useState(1);
  const [eventLog, setEventLog] = useState('idle');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [globalCacheStats, setGlobalCacheStats] = useState<StreamCacheStats>(EMPTY_CACHE_STATS);
  const [activeSourceStats, setActiveSourceStats] = useState<StreamSourceCacheStats>(EMPTY_SOURCE_CACHE_STATS);
  const [previewWindowHits, setPreviewWindowHits] = useState(0);
  const [prefetchedStreams, setPrefetchedStreams] = useState(0);

  const visibleItems = useMemo(() => getVisibleConsumerItems(pageIndex), [pageIndex]);
  const maxPageIndex = Math.ceil(CONSUMER_FEED_ITEMS.length / CONSUMER_PAGE_SIZE) - 1;
  const activeItem = visibleItems[Math.min(activeIndex, visibleItems.length - 1)] ?? visibleItems[0];
  const mountedItems = useMemo(
    () => getActiveWindow(visibleItems, activeIndex, poolRadius),
    [activeIndex, poolRadius, visibleItems]
  );
  const coldItems = visibleItems.length - mountedItems.length;
  const reuseGroups = useMemo(() => new Set(visibleItems.map(item => item.reuseGroup)).size, [visibleItems]);
  const sharedUriCount = useMemo(() => visibleItems.filter(item => item.source.uri === HLS_URL).length, [visibleItems]);

  useEffect(() => {
    if (activeIndex >= visibleItems.length) {
      setActiveIndex(Math.max(0, visibleItems.length - 1));
    }
  }, [activeIndex, visibleItems.length]);

  const runConsumerAction = async (label: string, action: () => Promise<void>) => {
    setBusyAction(label);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEventLog(`${label}: ${message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const refreshConsumerStats = async () => {
    if (!activeItem) {
      return;
    }

    const runtimeSource = toStreamRuntimeSource(activeItem.source);
    if (!runtimeSource) {
      return;
    }

    const [globalStats, sourceStats] = await Promise.all([
      streamCache.getStats(),
      streamCache.getStats(runtimeSource),
    ]);
    setGlobalCacheStats(globalStats as StreamCacheStats);
    setActiveSourceStats(sourceStats as StreamSourceCacheStats);
  };

  const getPrefetchWindow = () => getActiveWindow(visibleItems, activeIndex, CONSUMER_PREFETCH_WINDOW);

  const moveActiveIndex = (direction: 1 | -1) => {
    setActiveIndex(current => {
      const next = Math.min(Math.max(current + direction, 0), visibleItems.length - 1);
      setEventLog(`active item ${next + 1}/${visibleItems.length}`);
      return next;
    });
  };

  const appendPage = () => {
    setPageIndex(current => {
      const next = Math.min(current + 1, maxPageIndex);
      setEventLog(next === current ? 'all pages already mounted' : `page ${next + 1} appended`);
      return next;
    });
  };

  const resetPages = () => {
    setPageIndex(0);
    setActiveIndex(0);
    setPreviewWindowHits(0);
    setPrefetchedStreams(0);
    setEventLog('reset to page 1');
  };

  return (
    <View style={styles.consumerPanel}>
      <View style={styles.consumerSummaryRow}>
        <Metric label="page" value={`${pageIndex + 1}/${maxPageIndex + 1}`} />
        <Metric label="active" value={`${activeIndex + 1}/${visibleItems.length}`} />
        <Metric label="mounted pool" value={`${mountedItems.length} on / ${coldItems} cold`} />
        <Metric label="reuse groups" value={String(reuseGroups)} />
        <Metric label="HLS items" value={String(sharedUriCount)} />
        <Metric label="preview ready" value={String(previewWindowHits)} />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label="Prev Active"
          disabled={activeIndex === 0}
          testID={`${SCREEN_KEY}-consumer-prev`}
          onPress={() => moveActiveIndex(-1)}
        />
        <ActionButton
          label="Next Active"
          disabled={activeIndex >= visibleItems.length - 1}
          testID={`${SCREEN_KEY}-consumer-next`}
          onPress={() => moveActiveIndex(1)}
        />
        <ActionButton
          label="Append Page"
          disabled={pageIndex >= maxPageIndex}
          testID={`${SCREEN_KEY}-consumer-append`}
          onPress={appendPage}
        />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label={poolRadius === 1 ? 'Pool ±1' : 'Pool ±2'}
          active={poolRadius === 2}
          testID={`${SCREEN_KEY}-consumer-pool`}
          onPress={() => setPoolRadius(value => (value === 1 ? 2 : 1))}
        />
        <ActionButton
          label="Prefetch Streams"
          active={busyAction === 'prefetch visible streams'}
          testID={`${SCREEN_KEY}-consumer-prefetch`}
          onPress={() =>
            runConsumerAction('prefetch visible streams', async () => {
              const hlsSources = getPrefetchWindow().map(item => item.source).filter(isHlsManifestSource);
              await Promise.all(hlsSources.map(source => streamCache.prefetch(source)));
              await refreshConsumerStats();
              setPrefetchedStreams(value => value + hlsSources.length);
              setEventLog(`prefetched ${hlsSources.length} HLS streams`);
            })
          }
        />
        <ActionButton
          label="Generate Previews"
          active={busyAction === 'generate visible previews'}
          testID={`${SCREEN_KEY}-consumer-previews`}
          onPress={() =>
            runConsumerAction('generate visible previews', async () => {
              const previewSources = getPrefetchWindow()
                .map(item => toStreamRuntimeSource(item.source))
                .filter((source): source is NonNullable<typeof source> => source !== null);
              const previews = await Promise.all(previewSources.map(source => videoPreview.getFirstFrame(source)));
              setPreviewWindowHits(value => value + previews.filter(Boolean).length);
              setEventLog(`preview ready ${previews.filter(Boolean).length}/${previews.length}`);
            })
          }
        />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label="Refresh Stats"
          active={busyAction === 'consumer stats'}
          testID={`${SCREEN_KEY}-consumer-stats`}
          onPress={() =>
            runConsumerAction('consumer stats', async () => {
              await refreshConsumerStats();
              setEventLog('consumer stats refreshed');
            })
          }
        />
        <ActionButton label="Reset Pages" testID={`${SCREEN_KEY}-consumer-reset`} onPress={resetPages} />
      </View>

      <View style={styles.metricsGrid}>
        <Metric label="status" value={busyAction ?? eventLog} />
        <Metric label="active source" value={activeItem ? truncate(activeItem.reuseGroup, 24) : '-'} />
        <Metric label="global cache" value={formatBytes(globalCacheStats.totalSize)} />
        <Metric label="prefetched HLS" value={String(prefetchedStreams)} />
        <Metric label="active cache" value={formatBytes(activeSourceStats.streamSize)} />
      </View>

      <View style={styles.consumerList}>
        {visibleItems.map((item, index) => {
          const isActive = index === activeIndex;
          const isPooled = Math.abs(index - activeIndex) <= poolRadius;
          return (
            <ConsumerFeedCard
              key={item.key}
              item={item}
              index={index}
              isActive={isActive}
              isPooled={isPooled}
            />
          );
        })}
      </View>
    </View>
  );
}

function UtilityPanel({
  source,
  busyAction,
  actionMessage,
  globalCacheStats,
  sourceCacheStats,
  manualPreviewUri,
  onPrefetch,
  onRefreshStats,
  onFetchPreview,
  onClearPreview,
  onClearStreamCache,
}: {
  source: NitroSourceConfig;
  busyAction: string | null;
  actionMessage: string;
  globalCacheStats: StreamCacheStats;
  sourceCacheStats: StreamSourceCacheStats;
  manualPreviewUri: string | null;
  onPrefetch: () => void;
  onRefreshStats: () => void;
  onFetchPreview: () => void;
  onClearPreview: () => void;
  onClearStreamCache: () => void;
}) {
  return (
    <View style={styles.utilityPanel}>
      <View style={styles.utilityHeader}>
        <View>
          <Text style={styles.sectionTitle}>Runtime Utilities</Text>
          <Text style={styles.sectionSubtitle}>Direct exercise of `streamCache` and `videoPreview` for the active hero source.</Text>
        </View>
        <Text style={styles.utilityStatus}>{busyAction ?? actionMessage}</Text>
      </View>

      <View style={styles.buttonRow}>
        <ActionButton label="Prefetch Stream" active={busyAction === 'prefetch stream'} testID={`${SCREEN_KEY}-util-prefetch`} onPress={onPrefetch} />
        <ActionButton label="Refresh Stats" active={busyAction === 'stats'} testID={`${SCREEN_KEY}-util-stats`} onPress={onRefreshStats} />
        <ActionButton label="Generate Preview" active={busyAction === 'generate preview'} testID={`${SCREEN_KEY}-util-preview`} onPress={onFetchPreview} />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton label="Clear Preview" active={busyAction === 'preview clear'} testID={`${SCREEN_KEY}-util-clear-preview`} onPress={onClearPreview} />
        <ActionButton label="Clear Stream Cache" active={busyAction === 'cache clear'} testID={`${SCREEN_KEY}-util-clear-cache`} onPress={onClearStreamCache} />
      </View>

      <View style={styles.metricsGrid}>
        <Metric label="source" value={isHlsManifestSource(source) ? 'HLS stream' : 'direct media'} />
        <Metric label="headers" value={source.headers ? String(Object.keys(source.headers).length) : '0'} />
        <Metric label="global cache" value={formatBytes(globalCacheStats.totalSize)} />
        <Metric label="global files" value={String(globalCacheStats.fileCount)} />
        <Metric label="source cache" value={formatBytes(sourceCacheStats.streamSize)} />
        <Metric label="source files" value={String(sourceCacheStats.streamFileCount)} />
        <Metric label="preview mode" value={source.preview?.mode ?? 'listener'} />
        <Metric label="uri" value={truncate(String(source.uri), 42)} />
      </View>

      {manualPreviewUri ? (
        <View style={styles.utilityPreview}>
          <Image source={{ uri: manualPreviewUri }} style={styles.utilityPreviewImage} />
          <Text style={styles.utilityPreviewCaption}>{truncate(manualPreviewUri, 88)}</Text>
        </View>
      ) : (
        <View style={styles.utilityPreviewPlaceholder}>
          <Text style={styles.utilityPreviewPlaceholderText}>generated preview image will appear here</Text>
        </View>
      )}
    </View>
  );
}
