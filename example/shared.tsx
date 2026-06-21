import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  NitroPlayerView,
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
import { buildConsumerCardSource, type ConsumerFeedItem } from './scenarioModel';

export const EMPTY_CACHE_STATS: StreamCacheStats = {
  totalSize: 0,
  fileCount: 0,
  maxSize: 5_368_709_120,
};

export const EMPTY_SOURCE_CACHE_STATS: StreamSourceCacheStats = {
  ...EMPTY_CACHE_STATS,
  streamSize: 0,
  streamFileCount: 0,
};

// ---------------------------------------------------------------------------
// Shared formatting helpers
// ---------------------------------------------------------------------------

export function formatSeconds(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return '--:--';
  }

  const totalSeconds = Math.floor(value);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function formatBytes(value: number) {
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

export function truncate(value: string, max = 56) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
}

export function usePlayerViewHandle({
  onPlayerChange,
  onAttachChange,
}: {
  onPlayerChange?: (player: NitroPlayer | null) => void;
  onAttachChange?: (isAttached: boolean) => void;
}) {
  const viewRef = React.useRef<NitroPlayerViewRef | null>(null);
  const playerRef = React.useRef<NitroPlayer | null>(null);
  const attachedRef = React.useRef(false);

  const ref = React.useCallback(
    (instance: NitroPlayerViewRef | null) => {
      viewRef.current = instance;
      const nextPlayer = instance?.player ?? null;
      const nextAttached = instance?.isAttached ?? false;

      if (playerRef.current !== nextPlayer) {
        playerRef.current = nextPlayer;
        onPlayerChange?.(nextPlayer);
      }

      if (attachedRef.current !== nextAttached) {
        attachedRef.current = nextAttached;
        onAttachChange?.(nextAttached);
      }
    },
    [onAttachChange, onPlayerChange]
  );

  return { viewRef, ref };
}

// ---------------------------------------------------------------------------
// PlayerWorkbench - the reusable player card used across every screen.
// `testID`/`accessibilityLabel` is applied to the NitroPlayerView and derived
// for every control so argent can discover them on iOS and Android.
// ---------------------------------------------------------------------------

export function PlayerWorkbench({
  title,
  chip,
  description,
  source,
  accent,
  compact = false,
  testID,
}: {
  title: string;
  chip: string;
  description: string;
  source: NitroSourceConfig;
  accent: string;
  compact?: boolean;
  testID?: string;
}) {
  const [player, setPlayer] = useState<NitroPlayer | null>(null);
  const [isAttached, setIsAttached] = useState(false);
  const [lastLoad, setLastLoad] = useState('none');
  const [lastError, setLastError] = useState('none');
  const [firstFrame, setFirstFrame] = useState<onFirstFrameData | null>(null);
  const [bandwidth, setBandwidth] = useState<BandwidthData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [allowControls, setAllowControls] = useState(false);
  const handlePlayerChange = React.useCallback((nextPlayer: NitroPlayer | null) => setPlayer(nextPlayer), []);
  const handleAttachChange = React.useCallback((nextAttached: boolean) => setIsAttached(nextAttached), []);
  const { viewRef, ref: playerViewRef } = usePlayerViewHandle({
    onPlayerChange: handlePlayerChange,
    onAttachChange: handleAttachChange,
  });

  const playbackState = usePlaybackState(player);
  const status = playbackState?.status ?? 'idle';
  const canSeek = status === 'playing' || status === 'paused' || status === 'ended';
  const controlId = (control: string) => (testID ? `${testID}-${control}` : undefined);

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

  const playerTestID = testID ? `${testID}-player` : undefined;

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
          ref={playerViewRef}
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
          testID={playerTestID}
          accessibilityLabel={playerTestID}
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
          testID={controlId('toggle-play')}
          onPress={() => {
            const activePlayer = viewRef.current?.player;
            if (!activePlayer) {
              return;
            }
            try {
              if (status === 'playing') {
                activePlayer.pause();
              } else {
                activePlayer.play();
              }
            } catch (error) {
              setLastError(toErrorMessage(error));
            }
          }}
        />
        <ActionButton
          label="Replay"
          disabled={!canSeek}
          testID={controlId('replay')}
          onPress={() => {
            const activePlayer = viewRef.current?.player;
            if (!activePlayer) {
              return;
            }
            try {
              activePlayer.seekTo(0);
              activePlayer.play();
            } catch (error) {
              setLastError(toErrorMessage(error));
            }
          }}
        />
        <ActionButton
          label={allowControls ? 'Hide Controls' : 'Show Controls'}
          active={allowControls}
          testID={controlId('toggle-controls')}
          onPress={() => setAllowControls(value => !value)}
        />
      </View>

      {!compact ? (
        <View style={styles.buttonRow}>
          <ActionButton
            label="Seek +15s"
            disabled={!canSeek}
            testID={controlId('seek')}
            onPress={() => {
              try {
                viewRef.current?.player.seekBy(15);
              } catch (error) {
                setLastError(toErrorMessage(error));
              }
            }}
          />
          <ActionButton
            label="Preload"
            testID={controlId('preload')}
            onPress={() => {
              try {
                viewRef.current?.player.preload().catch(() => {});
              } catch (error) {
                setLastError(toErrorMessage(error));
              }
            }}
          />
          <ActionButton
            label="Init"
            testID={controlId('init')}
            onPress={() => {
              try {
                viewRef.current?.player.initialize().catch(() => {});
              } catch (error) {
                setLastError(toErrorMessage(error));
              }
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

// ---------------------------------------------------------------------------
// ConsumerFeedCard - the paged consumer lab card, reused on Home.
// ---------------------------------------------------------------------------

export function ConsumerFeedCard({
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
  const activeSource = useMemo((): NitroSourceConfig => buildConsumerCardSource(item, index, isActive), [index, isActive, item]);

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
      testID={`consumer-card-${index}`}
      compact
    />
  );
}

// ---------------------------------------------------------------------------
// Primitive controls
// ---------------------------------------------------------------------------

export function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

export function ChipButton({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityLabel={testID}
      style={[styles.chipButton, active && styles.chipButtonActive]}>
      <Text style={[styles.chipButtonLabel, active && styles.chipButtonLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export function ActionButton({
  label,
  onPress,
  active = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityLabel={testID}
      style={[styles.actionButton, active && styles.actionButtonActive, disabled && styles.actionButtonDisabled]}>
      <Text style={[styles.actionButtonLabel, disabled && styles.actionButtonLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function Metric({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.metricCell} testID={testID} accessibilityLabel={testID}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} testID={testID ? `${testID}-value` : undefined}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// EventLog - rolling text log shared by the lifecycle stress screens.
// ---------------------------------------------------------------------------

export function EventLog({ entries, testID }: { entries: string[]; testID?: string }) {
  return (
    <View style={styles.eventLog} testID={testID} accessibilityLabel={testID}>
      <Text style={styles.eventLogTitle}>event log</Text>
      {entries.length === 0 ? (
        <Text style={styles.eventLogEmpty}>no events yet</Text>
      ) : (
        entries.map((entry, index) => (
          <Text key={`${index}-${entry}`} style={styles.eventLogLine} numberOfLines={2}>
            {entry}
          </Text>
        ))
      )}
    </View>
  );
}

// Build a try/catch friendly error string used by every scenario screen.
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Append-with-cap helper for the rolling event logs (newest first).
export function appendLog(entries: string[], line: string, cap = 12): string[] {
  return [line, ...entries].slice(0, cap);
}

export const styles = StyleSheet.create({
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
  eventLog: {
    backgroundColor: '#091821',
    borderRadius: 8,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#1a3541',
  },
  eventLogTitle: {
    color: '#79a5b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  eventLogEmpty: {
    color: '#5f8294',
    fontSize: 13,
    fontStyle: 'italic',
  },
  eventLogLine: {
    color: '#cfe6f1',
    fontSize: 13,
    lineHeight: 18,
  },
});
