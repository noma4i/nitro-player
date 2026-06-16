import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  NitroPlayerView,
  streamCache,
  videoPreview,
  useEvent,
  usePlaybackState,
  type BandwidthData,
  type NitroPlayer,
  type NitroPlayerViewRef,
  type NitroSourceConfig,
  type PlaybackError,
  type StreamCacheStats,
  type StreamSourceCacheStats,
  type onFirstFrameData,
  type onLoadData,
} from '@noma4i/nitro-play';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const HLS_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const MP4_URL = 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4';

const EMPTY_CACHE_STATS: StreamCacheStats = {
  totalSize: 0,
  fileCount: 0,
  maxSize: 5_368_709_120,
};

const EMPTY_SOURCE_CACHE_STATS: StreamSourceCacheStats = {
  ...EMPTY_CACHE_STATS,
  streamSize: 0,
  streamFileCount: 0,
};

const isHlsManifestSource = (source: NitroSourceConfig): boolean => {
  if (typeof source.uri !== 'string') {
    return false;
  }

  return source.uri.split('?')[0]?.toLowerCase().endsWith('.m3u8') === true;
};

const HERO_SOURCES = {
  startupProxy: {
    key: 'startupProxy',
    label: 'Feed HLS Stream',
    chip: 'Proxy Route',
    note: 'Lazy HLS startup with automatic proxy routing. This is the stream-cache and playback recovery scenario.',
    source: {
      uri: HLS_URL,
      startup: 'lazy',
      metadata: {
        title: 'Feed stream',
        subtitle: 'Auto proxy',
      },
      transport: { mode: 'auto' },
      retention: {
        preload: 'metadata',
        offscreen: 'metadata',
        trimDelayMs: 4000,
        feedPoolEligible: true,
      },
      preview: {
        mode: 'always',
        maxWidth: 640,
        maxHeight: 360,
        quality: 80,
      },
    } satisfies NitroSourceConfig,
  },
  profileStream: {
    key: 'profileStream',
    label: 'Profile HLS Stream',
    chip: 'Header Scope',
    note: 'Same HLS URL with harmless scenario headers. Cache identity should stay scoped without breaking playback.',
    source: {
      uri: HLS_URL,
      headers: {
        'X-Nitro-Scenario': 'profile-feed',
      },
      startup: 'lazy',
      metadata: {
        title: 'Profile stream',
        subtitle: 'Scoped headers',
      },
      transport: { mode: 'auto' },
      retention: {
        preload: 'metadata',
        offscreen: 'metadata',
        trimDelayMs: 4000,
        feedPoolEligible: true,
      },
      preview: {
        mode: 'listener',
        maxWidth: 512,
        maxHeight: 512,
        quality: 72,
      },
    } satisfies NitroSourceConfig,
  },
  directMp4: {
    key: 'directMp4',
    label: 'Direct MP4 Preview',
    chip: 'Preview Path',
    note: 'Direct transport with explicit preview generation. This is the reliable emulator thumbnail scenario.',
    source: {
      uri: MP4_URL,
      startup: 'eager',
      metadata: {
        title: 'Direct clip',
        subtitle: 'Generated preview',
      },
      transport: { mode: 'direct' },
      retention: {
        preload: 'buffered',
        offscreen: 'hot',
        trimDelayMs: 12000,
        feedPoolEligible: false,
      },
      preview: {
        mode: 'manual',
        maxWidth: 480,
        maxHeight: 270,
        quality: 70,
      },
    } satisfies NitroSourceConfig,
  },
} as const;

const FEED_SOURCES = [
  {
    key: 'feed-home',
    title: 'Home Feed Stream',
    tone: '#ec5f67',
    source: HERO_SOURCES.profileStream.source,
    description: 'Header-scoped HLS in listener mode, matching a home feed cell.',
  },
  {
    key: 'feed-creator',
    title: 'Creator Feed Stream',
    tone: '#4cb3ff',
    source: {
      ...HERO_SOURCES.profileStream.source,
      headers: {
        'X-Nitro-Scenario': 'creator-feed',
      },
      metadata: {
        title: 'Creator stream',
        subtitle: 'Parallel feed cell',
      },
      preview: {
        mode: 'always',
        maxWidth: 512,
        maxHeight: 512,
        quality: 76,
      },
    } satisfies NitroSourceConfig,
    description: 'Same playable HLS URL with a different harmless header identity.',
  },
  {
    key: 'feed-direct',
    title: 'Inline MP4 Preview',
    tone: '#66d19e',
    source: HERO_SOURCES.directMp4.source,
    description: 'Direct MP4 alongside streaming cards to check mixed transport and preview coexistence.',
  },
] as const;

const CONSUMER_PAGE_SIZE = 3;
const CONSUMER_PREFETCH_WINDOW = 1;

type ConsumerFeedItem = {
  key: string;
  title: string;
  page: number;
  reuseGroup: string;
  source: NitroSourceConfig;
  note: string;
};

const CONSUMER_FEED_ITEMS: ConsumerFeedItem[] = [
  {
    key: 'page-1-home-active',
    title: 'Page 1 Home Stream',
    page: 1,
    reuseGroup: 'home-stream-object',
    source: HERO_SOURCES.profileStream.source,
    note: 'Same object as the profile/home stream. Verifies value-based reuse across surfaces.',
  },
  {
    key: 'page-1-creator-header',
    title: 'Page 1 Creator Stream',
    page: 1,
    reuseGroup: 'creator-stream-header',
    source: FEED_SOURCES[1].source,
    note: 'Same HLS URL, different harmless header. Cache identity must stay isolated.',
  },
  {
    key: 'page-1-direct',
    title: 'Page 1 MP4 Preview',
    page: 1,
    reuseGroup: 'direct-mp4',
    source: HERO_SOURCES.directMp4.source,
    note: 'Direct MP4 in the same pool as proxied HLS cards.',
  },
  {
    key: 'page-2-home-copy',
    title: 'Page 2 Home Reuse',
    page: 2,
    reuseGroup: 'home-stream-object',
    source: HERO_SOURCES.profileStream.source,
    note: 'Reuses the exact home stream object after page append.',
  },
  {
    key: 'page-2-topic-header',
    title: 'Page 2 Topic Stream',
    page: 2,
    reuseGroup: 'topic-stream-header',
    source: {
      ...HERO_SOURCES.profileStream.source,
      headers: {
        'X-Nitro-Scenario': 'topic-feed',
      },
      metadata: {
        title: 'Topic stream',
        subtitle: 'Page 2 variant',
      },
      retention: {
        preload: 'metadata',
        offscreen: 'metadata',
        trimDelayMs: 6000,
        feedPoolEligible: true,
      },
    } satisfies NitroSourceConfig,
    note: 'Header identity churn while keeping the playable URL stable.',
  },
  {
    key: 'page-2-startup-proxy',
    title: 'Page 2 Proxy Startup',
    page: 2,
    reuseGroup: 'startup-proxy',
    source: HERO_SOURCES.startupProxy.source,
    note: 'Lazy HLS startup source mounted after pagination.',
  },
  {
    key: 'page-3-direct-reuse',
    title: 'Page 3 MP4 Reuse',
    page: 3,
    reuseGroup: 'direct-mp4',
    source: HERO_SOURCES.directMp4.source,
    note: 'Direct MP4 source reused after multiple active-index changes.',
  },
  {
    key: 'page-3-home-new-metadata',
    title: 'Page 3 Home Metadata',
    page: 3,
    reuseGroup: 'home-stream-metadata',
    source: {
      ...HERO_SOURCES.profileStream.source,
      metadata: {
        title: 'Home stream',
        subtitle: 'Metadata identity variant',
      },
    } satisfies NitroSourceConfig,
    note: 'Same URL/header with metadata changed to stress source signature.',
  },
  {
    key: 'page-3-notification-header',
    title: 'Page 3 Notification Stream',
    page: 3,
    reuseGroup: 'notification-stream-header',
    source: {
      ...HERO_SOURCES.profileStream.source,
      headers: {
        'X-Nitro-Scenario': 'notification-feed',
      },
      metadata: {
        title: 'Notification stream',
        subtitle: 'Page 3 variant',
      },
      preview: {
        mode: 'listener',
        maxWidth: 320,
        maxHeight: 320,
        quality: 68,
      },
    } satisfies NitroSourceConfig,
    note: 'Late-page header variant with smaller preview target.',
  },
];

type HeroSourceKey = keyof typeof HERO_SOURCES;

function App() {
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
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
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
      </SafeAreaView>
    </SafeAreaProvider>
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

  const visibleItems = useMemo(() => CONSUMER_FEED_ITEMS.slice(0, (pageIndex + 1) * CONSUMER_PAGE_SIZE), [pageIndex]);
  const maxPageIndex = Math.ceil(CONSUMER_FEED_ITEMS.length / CONSUMER_PAGE_SIZE) - 1;
  const activeItem = visibleItems[Math.min(activeIndex, visibleItems.length - 1)] ?? visibleItems[0];
  const mountedItems = useMemo(
    () => visibleItems.filter((_, index) => Math.abs(index - activeIndex) <= poolRadius),
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

    const [globalStats, sourceStats] = await Promise.all([
      streamCache.getStats(),
      streamCache.getStats({ uri: activeItem.source.uri as string, headers: activeItem.source.headers }),
    ]);
    setGlobalCacheStats(globalStats as StreamCacheStats);
    setActiveSourceStats(sourceStats as StreamSourceCacheStats);
  };

  const getActiveWindow = () => {
    return visibleItems.filter((_, index) => Math.abs(index - activeIndex) <= CONSUMER_PREFETCH_WINDOW);
  };

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
        <ActionButton label="Prev Active" disabled={activeIndex === 0} onPress={() => moveActiveIndex(-1)} />
        <ActionButton label="Next Active" disabled={activeIndex >= visibleItems.length - 1} onPress={() => moveActiveIndex(1)} />
        <ActionButton label="Append Page" disabled={pageIndex >= maxPageIndex} onPress={appendPage} />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label={poolRadius === 1 ? 'Pool ±1' : 'Pool ±2'}
          active={poolRadius === 2}
          onPress={() => setPoolRadius(value => (value === 1 ? 2 : 1))}
        />
        <ActionButton
          label="Prefetch Streams"
          active={busyAction === 'prefetch visible streams'}
          onPress={() =>
            runConsumerAction('prefetch visible streams', async () => {
              const hlsItems = getActiveWindow().filter(item => isHlsManifestSource(item.source));
              await Promise.all(hlsItems.map(item => streamCache.prefetch(item.source)));
              await refreshConsumerStats();
              setPrefetchedStreams(value => value + hlsItems.length);
              setEventLog(`prefetched ${hlsItems.length} HLS streams`);
            })
          }
        />
        <ActionButton
          label="Generate Previews"
          active={busyAction === 'generate visible previews'}
          onPress={() =>
            runConsumerAction('generate visible previews', async () => {
              const previews = await Promise.all(getActiveWindow().map(item => videoPreview.getFirstFrame(item.source)));
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
          onPress={() =>
            runConsumerAction('consumer stats', async () => {
              await refreshConsumerStats();
              setEventLog('consumer stats refreshed');
            })
          }
        />
        <ActionButton label="Reset Pages" onPress={resetPages} />
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

function ConsumerFeedCard({
  item,
  index,
  isActive,
  isPooled,
}: {
  item: ConsumerFeedItem;
  index: number;
  isActive: boolean;
  isPooled: boolean;
}) {
  const activeSource = useMemo((): NitroSourceConfig => {
    const distanceRetention = isActive
      ? { preload: 'buffered' as const, offscreen: 'hot' as const, trimDelayMs: 12000, feedPoolEligible: true }
      : { preload: 'metadata' as const, offscreen: 'metadata' as const, trimDelayMs: 5000, feedPoolEligible: true };

    return {
      ...item.source,
      startup: isActive ? 'eager' : 'lazy',
      retention: {
        ...distanceRetention,
        ...(item.source.retention ?? {}),
      },
      transport: {
        mode: item.source.transport?.mode ?? 'auto',
        ...(item.source.transport ?? {}),
      },
      preview: {
        mode: isActive ? 'always' : 'listener',
        maxWidth: 512,
        maxHeight: 512,
        quality: 72,
        ...(item.source.preview ?? {}),
      },
      metadata: {
        ...(item.source.metadata ?? {}),
        title: item.title,
        subtitle: `page ${item.page}, row ${index + 1}`,
      },
    };
  }, [index, isActive, item]);

  if (!isPooled) {
    return (
      <View style={styles.consumerColdRow}>
        <View style={styles.consumerColdIndex}>
          <Text style={styles.consumerColdIndexText}>{index + 1}</Text>
        </View>
        <View style={styles.consumerColdContent}>
          <Text style={styles.consumerColdTitle}>{item.title}</Text>
          <Text style={styles.consumerColdText}>{item.note}</Text>
          <Text style={styles.consumerColdText}>cold placeholder: player unmounted, source data retained</Text>
        </View>
      </View>
    );
  }

  return (
    <PlayerWorkbench
      title={`${isActive ? 'Active' : 'Pooled'} • ${item.title}`}
      chip={`page ${item.page}`}
      description={`${item.note} Pool policy: ${isActive ? 'hot active' : 'metadata neighbour'}.`}
      source={activeSource}
      accent={isActive ? '#f7b955' : '#8cc7ff'}
      compact
    />
  );
}

function PlayerWorkbench({
  title,
  chip,
  description,
  source,
  accent,
  compact = false,
}: {
  title: string;
  chip: string;
  description: string;
  source: NitroSourceConfig;
  accent: string;
  compact?: boolean;
}) {
  const [player, setPlayer] = useState<NitroPlayer | null>(null);
  const [isAttached, setIsAttached] = useState(false);
  const [lastLoad, setLastLoad] = useState('none');
  const [lastError, setLastError] = useState('none');
  const [firstFrame, setFirstFrame] = useState<onFirstFrameData | null>(null);
  const [bandwidth, setBandwidth] = useState<BandwidthData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [allowControls, setAllowControls] = useState(false);
  const viewRef = React.useRef<NitroPlayerViewRef | null>(null);

  const playbackState = usePlaybackState(player);
  const status = playbackState?.status ?? 'idle';
  const canSeek = status === 'playing' || status === 'paused' || status === 'ended';

  useEffect(() => {
    setLastLoad('none');
    setLastError('none');
    setFirstFrame(null);
    setBandwidth(null);
    setIsFullscreen(false);
  }, [source]);

  useEvent(player, 'onLoad', (data: onLoadData) => {
    setLastLoad(`${data.width}x${data.height} • ${formatSeconds(data.duration)}`);
  });

  useEvent(player, 'onError', (error: PlaybackError) => {
    setLastError(`${error.code}: ${error.message}`);
  });

  useEvent(player, 'onFirstFrame', (data: onFirstFrameData) => {
    setFirstFrame(data);
  });

  useEvent(player, 'onBandwidthUpdate', (data: BandwidthData) => {
    setBandwidth(data);
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
        <View style={[styles.cardChip, { borderColor: accent }]}>
          <Text style={[styles.cardChipLabel, { color: accent }]}>{chip}</Text>
        </View>
      </View>

      <View style={styles.playerFrame}>
        {/* surfaceType="texture": these cards live in a ScrollView feed. TextureView
            renders inside the view hierarchy so it stays in sync while scrolling; a
            SurfaceView overlay can briefly desync its bounds during scroll/seek. */}
        <NitroPlayerView
          ref={instance => {
            viewRef.current = instance;
            setPlayer(instance?.player ?? null);
            setIsAttached(instance?.isAttached ?? false);
          }}
          source={source}
          playerDefaults={{ loop: true }}
          controls={allowControls || isFullscreen}
          resizeMode="contain"
          keepScreenAwake
          surfaceType="texture"
          onAttached={() => setIsAttached(true)}
          onDetached={() => setIsAttached(false)}
          onFullscreenChange={setIsFullscreen}
          style={styles.playerView}
        />
        {firstFrame?.uri ? (
          <Image source={{ uri: firstFrame.uri }} style={styles.firstFramePreview} />
        ) : (
          <View style={styles.firstFramePlaceholder}>
            <Text style={styles.firstFramePlaceholderText}>first frame pending</Text>
          </View>
        )}
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label={status === 'playing' ? 'Pause' : 'Play'}
          onPress={() => {
            const activePlayer = viewRef.current?.player;
            if (!activePlayer) {
              return;
            }
            if (status === 'playing') {
              activePlayer.pause();
            } else {
              activePlayer.play();
            }
          }}
        />
        <ActionButton
          label="Replay"
          disabled={!canSeek}
          onPress={() => {
            const activePlayer = viewRef.current?.player;
            if (!activePlayer) {
              return;
            }
            activePlayer.seekTo(0);
            activePlayer.play();
          }}
        />
        <ActionButton
          label={allowControls ? 'Hide Controls' : 'Show Controls'}
          active={allowControls}
          onPress={() => setAllowControls(value => !value)}
        />
      </View>

      {!compact ? (
        <View style={styles.buttonRow}>
          <ActionButton
            label="Seek +15s"
            disabled={!canSeek}
            onPress={() => viewRef.current?.player.seekBy(15)}
          />
          <ActionButton
            label="Preload"
            onPress={() => {
              viewRef.current?.player.preload().catch(() => {});
            }}
          />
          <ActionButton
            label="Init"
            onPress={() => {
              viewRef.current?.player.initialize().catch(() => {});
            }}
          />
        </View>
      ) : null}

      <View style={styles.metricsGrid}>
        <Metric label="status" value={status} />
        <Metric label="attached" value={isAttached ? 'yes' : 'no'} />
        <Metric label="visual" value={playbackState?.isVisualReady ? 'ready' : 'waiting'} />
        <Metric label="time" value={formatSeconds(playbackState?.currentTime ?? 0)} />
        <Metric label="buffer" value={formatSeconds(playbackState?.bufferDuration ?? 0)} />
        <Metric label="bandwidth" value={bandwidth ? `${(bandwidth.bitrate / 1_000_000).toFixed(2)} Mbps` : '-'} />
        <Metric label="onLoad" value={truncate(lastLoad)} />
        <Metric label="error" value={truncate(lastError)} />
        <Metric label="preview" value={firstFrame ? (firstFrame.fromCache ? 'cache hit' : 'fresh') : 'none'} />
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
        <ActionButton label="Prefetch Stream" active={busyAction === 'prefetch stream'} onPress={onPrefetch} />
        <ActionButton label="Refresh Stats" active={busyAction === 'stats'} onPress={onRefreshStats} />
        <ActionButton label="Generate Preview" active={busyAction === 'generate preview'} onPress={onFetchPreview} />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton label="Clear Preview" active={busyAction === 'preview clear'} onPress={onClearPreview} />
        <ActionButton label="Clear Stream Cache" active={busyAction === 'cache clear'} onPress={onClearStreamCache} />
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

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function ChipButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chipButton, active && styles.chipButtonActive]}>
      <Text style={[styles.chipButtonLabel, active && styles.chipButtonLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionButton, active && styles.actionButtonActive, disabled && styles.actionButtonDisabled]}>
      <Text style={[styles.actionButtonLabel, disabled && styles.actionButtonLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return '--:--';
  }

  const totalSeconds = Math.floor(value);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function truncate(value: string, max = 56) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07141b',
  },
  screen: {
    flex: 1,
    backgroundColor: '#07141b',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 44,
    gap: 18,
  },
  eyebrow: {
    color: '#86d8ff',
    fontSize: 12,
    letterSpacing: 1.8,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headline: {
    color: '#eef7fb',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  sectionHeader: {
    gap: 6,
    marginTop: 8,
  },
  sectionTitle: {
    color: '#f2fbff',
    fontSize: 20,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#91b9cb',
    fontSize: 14,
    lineHeight: 20,
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chipButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#11242d',
    borderWidth: 1,
    borderColor: '#244756',
  },
  chipButtonActive: {
    backgroundColor: '#1a4b63',
    borderColor: '#4cb3ff',
  },
  chipButtonLabel: {
    color: '#d7ebf5',
    fontSize: 13,
    fontWeight: '700',
  },
  chipButtonLabelActive: {
    color: '#ffffff',
  },
  card: {
    backgroundColor: '#0d1d25',
    borderRadius: 8,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#183441',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  cardTitleBlock: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    color: '#f5fbff',
    fontSize: 19,
    fontWeight: '800',
  },
  cardDescription: {
    color: '#9ab7c6',
    fontSize: 14,
    lineHeight: 20,
  },
  cardChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0a171d',
  },
  cardChipLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  playerFrame: {
    position: 'relative',
  },
  playerView: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  firstFramePreview: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 88,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: '#0e1f26',
  },
  firstFramePlaceholder: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(3,10,15,0.78)',
  },
  firstFramePlaceholderText: {
    color: '#b6d6e6',
    fontSize: 12,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexBasis: '30%',
    minWidth: 96,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: '#164157',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionButtonActive: {
    backgroundColor: '#2d7aad',
  },
  actionButtonDisabled: {
    backgroundColor: '#16252d',
    opacity: 0.45,
  },
  actionButtonLabel: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
  },
  actionButtonLabelDisabled: {
    color: '#89a5b2',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCell: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 126,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#10262f',
    gap: 4,
  },
  metricLabel: {
    color: '#79a5b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  metricValue: {
    color: '#f2fbff',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    flexShrink: 1,
  },
  utilityPanel: {
    backgroundColor: '#0b1a21',
    borderRadius: 8,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#17313b',
  },
  utilityHeader: {
    gap: 8,
  },
  utilityStatus: {
    color: '#75d7ff',
    fontSize: 13,
    fontWeight: '700',
  },
  utilityPreview: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#09161c',
    borderWidth: 1,
    borderColor: '#19313c',
  },
  utilityPreviewImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  utilityPreviewCaption: {
    color: '#c7dce6',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  utilityPreviewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#274651',
    backgroundColor: '#0c171d',
  },
  utilityPreviewPlaceholderText: {
    color: '#87aaba',
    fontSize: 13,
    fontWeight: '700',
  },
  feedColumn: {
    gap: 16,
  },
  consumerPanel: {
    gap: 14,
  },
  consumerSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  consumerList: {
    gap: 14,
    marginTop: 2,
  },
  consumerColdRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#091821',
    borderWidth: 1,
    borderColor: '#1a3541',
  },
  consumerColdIndex: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#122b36',
    borderWidth: 1,
    borderColor: '#244756',
  },
  consumerColdIndexText: {
    color: '#8ed6ff',
    fontSize: 13,
    fontWeight: '800',
  },
  consumerColdContent: {
    flex: 1,
    gap: 4,
  },
  consumerColdTitle: {
    color: '#eaf6fb',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  consumerColdText: {
    color: '#8faebe',
    fontSize: 13,
    lineHeight: 18,
  },
});

export default App;
