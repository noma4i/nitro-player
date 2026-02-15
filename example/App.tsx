import React, { useEffect, useRef } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { VideoView, hlsCacheProxy, usePlaybackState, type VideoViewRef } from '@noma4i/just-player';

const SOURCE_URI = 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.mpd/.m3u8';

function App() {
  const videoRef = useRef<VideoViewRef>(null);
  const playbackState = usePlaybackState(videoRef.current?.player ?? null);

  useEffect(() => {
    hlsCacheProxy.start();
    return () => {
      hlsCacheProxy.stop();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>JustPlayer Example</Text>

        <VideoView
          ref={videoRef}
          source={{
            uri: SOURCE_URI,
            useHlsProxy: true,
            initializeOnCreation: true,
            memoryConfig: { profile: 'feed' }
          }}
          resizeMode="contain"
          controls={false}
          keepScreenAwake
          style={styles.video}
        />

        <View style={styles.row}>
          <ActionButton
            label="Play"
            onPress={() => {
              videoRef.current?.player.play();
            }}
          />
          <ActionButton
            label="Pause"
            onPress={() => {
              videoRef.current?.player.pause();
            }}
          />
        </View>

        <View style={styles.row}>
          <ActionButton
            label="Seek 10s"
            onPress={() => {
              videoRef.current?.player.seekTo(10);
            }}
          />
          <ActionButton
            label="Replay"
            onPress={() => {
              const player = videoRef.current?.player;
              if (!player) {
                return;
              }
              player.seekTo(0);
              player.play();
            }}
          />
        </View>

        <View style={styles.panel}>
          <StateRow
            label="status"
            value={playbackState?.status ?? 'idle'}
          />
          <StateRow
            label="time"
            value={formatSeconds(playbackState?.currentTime ?? 0)}
          />
          <StateRow
            label="duration"
            value={formatSeconds(playbackState?.duration ?? 0)}
          />
          <StateRow
            label="buffered"
            value={formatSeconds(playbackState?.bufferedPosition ?? 0)}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.button}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stateRow}>
      <Text style={styles.stateLabel}>{label}</Text>
      <Text style={styles.stateValue}>{value}</Text>
    </View>
  );
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return '--:--';
  }

  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#06131f'
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: '#06131f'
  },
  eyebrow: {
    color: '#75d7ff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2
  },
  title: {
    marginTop: 8,
    marginBottom: 20,
    color: '#f3f7fb',
    fontSize: 28,
    fontWeight: '700'
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 20,
    backgroundColor: '#000',
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#0f8bd7'
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  panel: {
    marginTop: 24,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#0d2234',
    gap: 10
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  stateLabel: {
    color: '#7ba6c4',
    fontSize: 14,
    textTransform: 'uppercase'
  },
  stateValue: {
    color: '#f3f7fb',
    fontSize: 14,
    fontWeight: '600'
  }
});

export default App;
