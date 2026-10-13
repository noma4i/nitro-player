import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  NITRO_PLAYBACK_CONTEXTS,
  NitroPlaybackBoundary,
  NitroPlaybackSurface,
  clearNitroPlaybackCache,
  getNitroPlaybackCacheStats,
  prefetchNitroPlaybackSource,
  type NitroCacheStats,
  type NitroPlaybackSurfaceRef,
  type NitroPlaybackSurfaceSnapshot
} from '@noma4i/nitro-play';
import { SURFACE_SOURCES, formatBytes, formatSeconds } from '../scenarioModel';
import { ActionButton, Metric, styles } from '../ui';

export function SurfaceScreen() {
  const surfaceRef = useRef<NitroPlaybackSurfaceRef>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [shouldPlay, setShouldPlay] = useState(true);
  const [muted, setMuted] = useState(true);
  const [loop, setLoop] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [snapshot, setSnapshot] = useState<NitroPlaybackSurfaceSnapshot | null>(null);
  const [cacheStats, setCacheStats] = useState<NitroCacheStats | null>(null);
  const entry = SURFACE_SOURCES[sourceIndex];
  const nextEntry = SURFACE_SOURCES[(sourceIndex + 1) % SURFACE_SOURCES.length];

  const refreshCacheStats = useCallback(() => {
    getNitroPlaybackCacheStats().then(setCacheStats, () => setCacheStats(null));
  }, []);

  return (
    <ScrollView style={styles.screen} testID="screen-surface">
      <NitroPlaybackBoundary suspended={suspended}>
        <NitroPlaybackSurface
          ref={surfaceRef}
          style={styles.video}
          source={entry.source}
          playbackKey={`example-${entry.key}`}
          context={NITRO_PLAYBACK_CONTEXTS.hero}
          shouldPlay={shouldPlay}
          active
          visible
          muted={muted}
          loop={loop}
          onSnapshotChange={setSnapshot}
        />
      </NitroPlaybackBoundary>
      <Text style={{ color: '#e8f4f8', marginTop: 8 }}>{entry.title}</Text>
      <View style={styles.row}>
        <Metric label="Status" value={snapshot?.status ?? 'idle'} testID="metric-status" />
        <Metric label="Attached" value={String(snapshot?.isAttached ?? false)} />
        <Metric label="Visual ready" value={String(snapshot?.isVisualReady ?? false)} testID="metric-visual-ready" />
        <Metric label="Playing" value={String(snapshot?.isPlaying ?? false)} />
        <Metric label="Buffering" value={String(snapshot?.isBuffering ?? false)} />
        <Metric label="Position" value={`${formatSeconds(snapshot?.currentTime ?? 0)} / ${formatSeconds(snapshot?.duration ?? 0)}`} />
        <Metric label="Error" value={snapshot?.error?.message ?? 'none'} />
      </View>
      <View style={styles.row}>
        <ActionButton testID="btn-play" label={shouldPlay ? 'Pause' : 'Play'} active={shouldPlay} onPress={() => setShouldPlay(value => !value)} />
        <ActionButton testID="btn-mute" label={muted ? 'Unmute' : 'Mute'} active={muted} onPress={() => setMuted(value => !value)} />
        <ActionButton testID="btn-loop" label="Loop" active={loop} onPress={() => setLoop(value => !value)} />
        <ActionButton testID="btn-replay" label="Replay" onPress={() => surfaceRef.current?.replay()} />
        <ActionButton testID="btn-seek" label="Seek 10s" onPress={() => surfaceRef.current?.seekTo(10)} />
        <ActionButton testID="btn-swap" label="Next source" onPress={() => setSourceIndex(value => (value + 1) % SURFACE_SOURCES.length)} />
        <ActionButton testID="btn-suspend" label="Suspend" active={suspended} onPress={() => setSuspended(value => !value)} />
      </View>
      <View style={styles.row}>
        <ActionButton testID="btn-prefetch" label={`Prefetch ${nextEntry.key}`} onPress={() => prefetchNitroPlaybackSource(nextEntry.source, { durationSeconds: 4 })} />
        <ActionButton testID="btn-cache-stats" label="Cache stats" onPress={refreshCacheStats} />
        <ActionButton
          testID="btn-cache-clear"
          label="Clear cache"
          onPress={() => {
            clearNitroPlaybackCache().then(refreshCacheStats, refreshCacheStats);
          }}
        />
      </View>
      <View style={styles.row}>
        <Metric label="Cache size" value={cacheStats ? formatBytes(cacheStats.totalBytes) : '--'} testID="metric-cache-size" />
        <Metric label="Cache files" value={cacheStats ? String(cacheStats.fileCount) : '--'} />
        <Metric label="Cache max" value={cacheStats ? formatBytes(cacheStats.maxBytes) : '--'} />
      </View>
    </ScrollView>
  );
}
