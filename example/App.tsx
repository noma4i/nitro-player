import React, { useEffect, useState } from 'react';
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
const MP4_URL = 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

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

const HERO_SOURCES = {
  startupProxy: {
    key: 'startupProxy',
    label: 'HLS Auto Proxy',
    chip: 'Startup Recovery',
    note: 'Lazy startup, proxy auto-route, preview always. Useful for cold launch and first-play validation.',
    source: {
      uri: HLS_URL,
      startup: 'lazy',
      metadata: {
        title: 'Cold start HLS',
        subtitle: 'Proxy auto',
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
  headerAlpha: {
    key: 'headerAlpha',
    label: 'HLS Header Alpha',
    chip: 'Header Identity',
    note: 'Same HLS URL with Authorization=alpha. Cache and preview must stay isolated from other header variants.',
    source: {
      uri: HLS_URL,
      headers: {
        Authorization: 'Bearer alpha',
        'X-Demo-Track': 'alpha',
      },
      startup: 'lazy',
      metadata: {
        title: 'Header alpha',
        subtitle: 'Shared URL, isolated identity',
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
    label: 'Direct MP4 Manual Preview',
    chip: 'Direct + Manual',
    note: 'Direct transport, eager startup, manual preview extraction. Good for pull-only preview testing.',
    source: {
      uri: MP4_URL,
      startup: 'eager',
      metadata: {
        title: 'Direct MP4',
        subtitle: 'Manual preview',
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
    key: 'feed-alpha',
    title: 'Feed Alpha',
    tone: '#ec5f67',
    source: HERO_SOURCES.headerAlpha.source,
    description: 'Header-aware HLS in listener mode.',
  },
  {
    key: 'feed-beta',
    title: 'Feed Beta',
    tone: '#4cb3ff',
    source: {
      ...HERO_SOURCES.headerAlpha.source,
      headers: {
        Authorization: 'Bearer beta',
        'X-Demo-Track': 'beta',
      },
      metadata: {
        title: 'Header beta',
        subtitle: 'Parallel sibling',
      },
      preview: {
        mode: 'always',
        maxWidth: 512,
        maxHeight: 512,
        quality: 76,
      },
    } satisfies NitroSourceConfig,
    description: 'Same URL, different headers. Must not poison alpha cache or preview.',
  },
  {
    key: 'feed-direct',
    title: 'Feed Direct',
    tone: '#66d19e',
    source: HERO_SOURCES.directMp4.source,
    description: 'Direct MP4 alongside streaming cards to check mixed transport coexistence.',
  },
] as const;

type HeroSourceKey = keyof typeof HERO_SOURCES;

function App() {
  const [activeHeroKey, setActiveHeroKey] = useState<HeroSourceKey>('startupProxy');
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
          <Text style={styles.headline}>Startup, multi-player feed, preview, cache, and source churn in one screen.</Text>

          <SectionTitle title="Hero Playback" subtitle="Switch the same surface across transport and preview modes." />

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
              runAction('prefetch', async () => {
                await streamCache.prefetch(activeHero.source);
                await refreshStats(activeHero.source);
                setActionMessage('prefetch complete');
              })
            }
            onRefreshStats={() =>
              runAction('stats', async () => {
                await refreshStats(activeHero.source);
                setActionMessage('stats refreshed');
              })
            }
            onFetchPreview={() =>
              runAction('preview', async () => {
                const next = await videoPreview.getFirstFrame(activeHero.source);
                setManualPreviewUri(next);
                setActionMessage(next ? 'preview artifact resolved' : 'preview unavailable');
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
            subtitle="Three players mounted together: same HLS URL with different headers plus direct MP4."
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
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
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
          surfaceType="surface"
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
        <ActionButton label="Prefetch" active={busyAction === 'prefetch'} onPress={onPrefetch} />
        <ActionButton label="Refresh Stats" active={busyAction === 'stats'} onPress={onRefreshStats} />
        <ActionButton label="Manual Preview" active={busyAction === 'preview'} onPress={onFetchPreview} />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton label="Clear Preview" active={busyAction === 'preview clear'} onPress={onClearPreview} />
        <ActionButton label="Clear Stream Cache" active={busyAction === 'cache clear'} onPress={onClearStreamCache} />
      </View>

      <View style={styles.metricsGrid}>
        <Metric label="uri" value={truncate(String(source.uri), 42)} />
        <Metric label="headers" value={source.headers ? String(Object.keys(source.headers).length) : '0'} />
        <Metric label="global cache" value={formatBytes(globalCacheStats.totalSize)} />
        <Metric label="global files" value={String(globalCacheStats.fileCount)} />
        <Metric label="source cache" value={formatBytes(sourceCacheStats.streamSize)} />
        <Metric label="source files" value={String(sourceCacheStats.streamFileCount)} />
        <Metric label="preview mode" value={source.preview?.mode ?? 'listener'} />
      </View>

      {manualPreviewUri ? (
        <View style={styles.utilityPreview}>
          <Image source={{ uri: manualPreviewUri }} style={styles.utilityPreviewImage} />
          <Text style={styles.utilityPreviewCaption}>{truncate(manualPreviewUri, 88)}</Text>
        </View>
      ) : (
        <View style={styles.utilityPreviewPlaceholder}>
          <Text style={styles.utilityPreviewPlaceholderText}>manual preview artifact will appear here</Text>
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
    borderRadius: 24,
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
    borderRadius: 18,
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
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#164157',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
    fontWeight: '800',
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
    minWidth: '31%',
    flexGrow: 1,
    padding: 12,
    borderRadius: 16,
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
    fontWeight: '700',
  },
  utilityPanel: {
    backgroundColor: '#0b1a21',
    borderRadius: 24,
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
    borderRadius: 18,
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
    borderRadius: 18,
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
});

export default App;
