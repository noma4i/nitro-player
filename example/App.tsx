import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  NitroPlayerView,
  hlsCacheProxy,
  usePlaybackState,
  useEvent,
  type HlsStreamCacheStats,
  type onLoadData,
  type onLoadStartData,
  type BandwidthData,
  type NitroPlayerRuntimeError,
  type NitroPlayerViewRef,
  type PlaybackState,
} from '@noma4i/nitro-play';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const SOURCES = {
  hls: {
    label: 'HLS',
    source: {
      uri: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      useHlsProxy: true,
      initializeOnCreation: true,
      memoryConfig: { profile: 'feed' as const }
    }
  },
  mp4: {
    label: 'MP4',
    source: {
      uri: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      useHlsProxy: false,
      initializeOnCreation: true,
      memoryConfig: { profile: 'feed' as const }
    }
  }
} as const;

function App() {
  const emptyStreamCacheStats = useMemo<HlsStreamCacheStats>(() => ({
    totalSize: 0, fileCount: 0, maxSize: 5_368_709_120, streamSize: 0, streamFileCount: 0
  }), []);
  const videoRef = useRef<NitroPlayerViewRef>(null);
  const [player, setPlayer] = useState<NitroPlayerViewRef['player'] | null>(null);
  const [selectedSourceKey, setSelectedSourceKey] = useState<keyof typeof SOURCES>('hls');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastLoadStart, setLastLoadStart] = useState<string>('none');
  const [lastLoad, setLastLoad] = useState<string>('none');
  const [streamCacheStats, setStreamCacheStats] = useState<HlsStreamCacheStats>(emptyStreamCacheStats);
  const [showControls, setShowControls] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bandwidth, setBandwidth] = useState<BandwidthData | null>(null);
  const [status, setStatus] = useState<string>('idle');

  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const isReady = isPlaying || isPaused || status === 'ended';

  const selectedSource = useMemo(() => SOURCES[selectedSourceKey], [selectedSourceKey]);

  const handleVideoRef = useCallback((instance: NitroPlayerViewRef | null) => {
    videoRef.current = instance;
    setPlayer(instance?.player ?? null);
  }, []);

  useEvent(player, 'onPlaybackState', useCallback((state: PlaybackState) => {
    setStatus(prev => prev !== state.status ? state.status : prev);
  }, []));

  useEvent(player, 'onBandwidthUpdate', useCallback((data: BandwidthData) => {
    setBandwidth(data);
  }, []));

  useEffect(() => {
    setLastError(null);
    setPlayer(null);
    setBandwidth(null);
    setIsFullscreen(false);
    setStatus('idle');
  }, [selectedSourceKey]);

  useEffect(() => {
    let isCancelled = false;
    if (selectedSourceKey !== 'hls') {
      setStreamCacheStats(emptyStreamCacheStats);
      return;
    }
    const streamUrl = selectedSource.source.uri;
    const refresh = async () => {
      const nextStats = await hlsCacheProxy.getStreamCacheStats(streamUrl);
      if (!isCancelled) setStreamCacheStats(nextStats);
    };
    refresh().catch(() => {});
    const intervalId = setInterval(() => { refresh().catch(() => {}); }, 1000);
    return () => { isCancelled = true; clearInterval(intervalId); };
  }, [emptyStreamCacheStats, selectedSource.source.uri, selectedSourceKey]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.container}>
          <Text style={styles.eyebrow}>NitroPlay Example</Text>
          <Text style={styles.subtitle}>Switch between working HLS and MP4 demo sources</Text>

          <View style={styles.row}>
            {Object.entries(SOURCES).map(([key, value]) => (
              <SourceButton
                key={key}
                label={value.label}
                active={key === selectedSourceKey}
                onPress={() => setSelectedSourceKey(key as keyof typeof SOURCES)}
              />
            ))}
          </View>

          <View style={styles.videoWrapper}>
            <NitroPlayerView
              key={selectedSourceKey}
              ref={handleVideoRef}
              source={selectedSource.source}
              setup={useCallback((p: any) => p.play(), [])}
              onLoadStart={useCallback((e: onLoadStartData) => {
                setLastLoadStart(`${e.sourceType}:${e.source.url}`);
              }, [])}
              onLoad={useCallback((e: onLoadData) => {
                setLastLoad(`${e.width}x${e.height} duration=${e.duration}`);
              }, [])}
              onError={useCallback((e: NitroPlayerRuntimeError) => {
                setLastError(`${e.code}: ${e.message}`);
              }, [])}
              onFullscreenChange={useCallback((fs: boolean) => setIsFullscreen(fs), [])}
              resizeMode="contain"
              controls={showControls}
              keepScreenAwake
              style={styles.video}
            />
            {isFullscreen && (
              <Pressable
                style={styles.exitFsButton}
                onPress={() => videoRef.current?.exitFullscreen()}
              >
                <Text style={styles.exitFsLabel}>X</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.row}>
            <ActionButton
              label="Play"
              active={isPlaying}
              disabled={isPlaying}
              onPress={() => videoRef.current?.player.play()}
            />
            <ActionButton
              label="Pause"
              active={isPaused}
              disabled={!isPlaying}
              onPress={() => videoRef.current?.player.pause()}
            />
          </View>

          <View style={styles.row}>
            <ActionButton
              label="+10s"
              disabled={!isReady}
              onPress={() => videoRef.current?.player.seekBy(10)}
            />
            <ActionButton
              label="Replay"
              disabled={!isReady}
              onPress={() => {
                const p = videoRef.current?.player;
                if (!p) return;
                p.seekTo(0);
                p.play();
              }}
            />
          </View>

          <View style={styles.row}>
            <ActionButton
              label="Fullscreen"
              active={isFullscreen}
              onPress={() => videoRef.current?.enterFullscreen()}
            />
            <ActionButton
              label={showControls ? 'Hide Controls' : 'Show Controls'}
              active={showControls}
              onPress={() => setShowControls(v => !v)}
            />
          </View>

          <PlaybackStats
            player={player}
            sourceLabel={selectedSource.label}
            bandwidth={bandwidth}
            streamCacheStats={streamCacheStats}
            selectedSourceKey={selectedSourceKey}
            lastLoadStart={lastLoadStart}
            lastLoad={lastLoad}
            lastError={lastError}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const PlaybackStats = React.memo(function PlaybackStats({
  player,
  sourceLabel,
  bandwidth,
  streamCacheStats,
  selectedSourceKey,
  lastLoadStart,
  lastLoad,
  lastError,
}: {
  player: NitroPlayerViewRef['player'] | null;
  sourceLabel: string;
  bandwidth: BandwidthData | null;
  streamCacheStats: HlsStreamCacheStats;
  selectedSourceKey: string;
  lastLoadStart: string;
  lastLoad: string;
  lastError: string | null;
}) {
  const playbackState = usePlaybackState(player);

  return (
    <View style={styles.panel}>
      <StateRow label="source" value={sourceLabel} />
      <StateRow label="status" value={playbackState?.status ?? 'idle'} />
      <StateRow label="time" value={formatSeconds(playbackState?.currentTime ?? 0)} />
      <StateRow label="duration" value={formatSeconds(playbackState?.duration ?? 0)} />
      <StateRow label="buffered" value={formatSeconds(playbackState?.bufferedPosition ?? 0)} />
      <StateRow
        label="bitrate"
        value={bandwidth ? `${(bandwidth.bitrate / 1_000_000).toFixed(2)} Mbps` : '-'}
      />
      <StateRow
        label="cache"
        value={selectedSourceKey === 'hls' ? formatBytes(streamCacheStats.streamSize) : 'n/a'}
      />
      <StateRow
        label="cacheFiles"
        value={selectedSourceKey === 'hls' ? String(streamCacheStats.streamFileCount) : 'n/a'}
      />
      <StateRow label="loadStart" value={truncate(lastLoadStart)} />
      <StateRow label="onLoad" value={truncate(lastLoad)} />
      <StateRow label="error" value={truncate(lastError ?? 'none')} />
    </View>
  );
});

function SourceButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, styles.sourceButton, active && styles.sourceButtonActive]}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const ActionButton = React.memo(function ActionButton({
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
      style={[
        styles.button,
        active && styles.buttonActive,
        disabled && styles.buttonDisabled,
      ]}>
      <Text style={[styles.buttonLabel, disabled && styles.buttonLabelDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
});

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stateRow}>
      <Text style={styles.stateLabel}>{label}</Text>
      <Text style={styles.stateValue}>{value}</Text>
    </View>
  );
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value) || value < 0) return '--:--';
  const s = Math.floor(value % 60).toString().padStart(2, '0');
  const m = Math.floor(value / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function truncate(value: string, max = 48) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06131f' },
  container: { flex: 1, paddingHorizontal: 20, paddingVertical: 24, backgroundColor: '#06131f' },
  eyebrow: { color: '#75d7ff', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  subtitle: { marginTop: 8, color: '#cde7f8', fontSize: 15, lineHeight: 21 },
  videoWrapper: { marginTop: 12, position: 'relative' },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: 20, backgroundColor: '#000', overflow: 'hidden' },
  exitFsButton: {
    position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  exitFsLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12, marginTop: 16 },
  button: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 14, backgroundColor: '#0f8bd7' },
  buttonActive: { backgroundColor: '#0a5f8f' },
  buttonDisabled: { backgroundColor: '#1a2d3d', opacity: 0.5 },
  sourceButton: { backgroundColor: '#10324b' },
  sourceButtonActive: { backgroundColor: '#0f8bd7' },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonLabelDisabled: { color: '#5a7a8f' },
  panel: { marginTop: 24, padding: 16, borderRadius: 18, backgroundColor: '#0d2234', gap: 10 },
  stateRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  stateLabel: { color: '#7ba6c4', fontSize: 14, textTransform: 'uppercase' },
  stateValue: { color: '#f3f7fb', fontSize: 14, fontWeight: '600' },
});

export default App;
