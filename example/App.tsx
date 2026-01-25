/**
 * @noma4i/just-player - Full Example
 *
 * Just <VideoView source={{ uri }} /> - that's it.
 * HLS caching is built-in and automatic.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import {
  VideoView,
  hlsCacheProxy,
  type VideoViewRef,
  type HlsCacheStats,
} from '@noma4i/just-player';

// ─── App ───────────────────────────────────────────────────────
export default function App() {
  useEffect(() => {
    hlsCacheProxy.start();
    return () => hlsCacheProxy.stop();
  }, []);

  return (
    <View style={styles.container}>
      <SimpleExample />
      <WithControlsExample />
      <CacheInfo />
    </View>
  );
}

// ─── Simple ────────────────────────────────────────────────────
// One line. HLS segments are cached automatically.
function SimpleExample() {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Simple</Text>
      <VideoView
        source={{ uri: 'https://cdn.example.com/video.m3u8' }}
        style={styles.video}
        resizeMode="cover"
      />
    </View>
  );
}

// ─── With Controls ─────────────────────────────────────────────
// Access player via ref for play/pause/seek.
function WithControlsExample() {
  const ref = useRef<VideoViewRef>(null);

  return (
    <View style={styles.section}>
      <Text style={styles.title}>With Controls</Text>
      <VideoView
        ref={ref}
        source={{
          uri: 'https://cdn.example.com/video.m3u8',
          headers: { Authorization: 'Bearer token' },
        }}
        setup={(p) => {
          p.loop = true;
          p.volume = 0.5;
        }}
        style={styles.video}
        resizeMode="contain"
      />
      <View style={styles.controls}>
        <Button title="Play" onPress={() => ref.current?.player.play()} />
        <Button title="Pause" onPress={() => ref.current?.player.pause()} />
        <Button title="Seek 30s" onPress={() => ref.current?.player.seekTo(30)} />
      </View>
    </View>
  );
}

// ─── Cache Info ────────────────────────────────────────────────
function CacheInfo() {
  const [stats, setStats] = useState<HlsCacheStats | null>(null);

  const loadStats = async () => setStats(await hlsCacheProxy.getCacheStats());

  useEffect(() => { loadStats(); }, []);

  const usedMB = stats ? (stats.totalSize / 1024 / 1024).toFixed(1) : '-';
  const maxMB = stats ? (stats.maxSize / 1024 / 1024).toFixed(0) : '-';

  return (
    <View style={styles.section}>
      <Text style={styles.title}>HLS Cache</Text>
      <Text>{usedMB} MB / {maxMB} MB ({stats?.fileCount ?? 0} files)</Text>
      <View style={styles.controls}>
        <Button title="Refresh" onPress={loadStats} />
        <Button title="Clear" onPress={async () => { await hlsCacheProxy.clearCache(); loadStats(); }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 24 },
  section: { gap: 8 },
  title: { fontSize: 16, fontWeight: '600' },
  video: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#000' },
  controls: { flexDirection: 'row', gap: 8 },
});
