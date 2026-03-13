import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  VideoView,
  hlsCacheProxy,
  usePlaybackState,
  useEvent,
  type HlsStreamCacheStats,
  type onLoadData,
  type onLoadStartData,
  type BandwidthData,
  type VideoRuntimeError,
  type VideoViewRef
} from '@noma4i/just-player';
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
    totalSize: 0,
    fileCount: 0,
    maxSize: 5_368_709_120,
    streamSize: 0,
    streamFileCount: 0
  }), []);
  const videoRef = useRef<VideoViewRef>(null);
  const [player, setPlayer] = useState<VideoViewRef['player'] | null>(null);
  const [selectedSourceKey, setSelectedSourceKey] = useState<keyof typeof SOURCES>('hls');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastLoadStart, setLastLoadStart] = useState<string>('none');
  const [lastLoad, setLastLoad] = useState<string>('none');
  const [streamCacheStats, setStreamCacheStats] = useState<HlsStreamCacheStats>(emptyStreamCacheStats);
  const [showControls, setShowControls] = useState(false);
  const [bandwidth, setBandwidth] = useState<BandwidthData | null>(null);
  const playbackState = usePlaybackState(player);
  const selectedSource = useMemo(
    () => SOURCES[selectedSourceKey],
    [selectedSourceKey]
  );
  const handleVideoRef = useCallback((instance: VideoViewRef | null) => {
    videoRef.current = instance;
    setPlayer(instance?.player ?? null);
  }, []);

  useEvent(player, 'onBandwidthUpdate', useCallback((data: BandwidthData) => {
    setBandwidth(data);
  }, []));

  useEffect(() => {
    setLastError(null);
    setPlayer(null);
    setBandwidth(null);
  }, [selectedSourceKey]);

  useEffect(() => {
    console.log('[Example] playbackState', selectedSourceKey, playbackState);
  }, [playbackState, selectedSourceKey]);

  useEffect(() => {
    let isCancelled = false;

    if (selectedSourceKey !== 'hls') {
      setStreamCacheStats(emptyStreamCacheStats);
      return;
    }

    const streamUrl = selectedSource.source.uri;

    const refresh = async () => {
      const nextStats = await hlsCacheProxy.getStreamCacheStats(streamUrl);
      if (!isCancelled) {
        setStreamCacheStats(nextStats);
      }
    };

    refresh().catch(() => {});
    const intervalId = setInterval(() => {
      refresh().catch(() => {});
    }, 1000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [emptyStreamCacheStats, selectedSource.source.uri, selectedSourceKey]);

  const handleLoadStart = (event: onLoadStartData) => {
    const value = `${event.sourceType}:${event.source.url}`;
    console.log('[Example] onLoadStart', value);
    setLastLoadStart(value);
  };

  const handleLoad = (event: onLoadData) => {
    const value = `${event.width}x${event.height} duration=${event.duration}`;
    console.log('[Example] onLoad', value);
    setLastLoad(value);
  };

  const handleError = (error: VideoRuntimeError) => {
    const value = `${error.code}: ${error.message}`;
    console.log('[Example] onError', value, error.cause);
    setLastError(value);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.container}>
          <Text style={styles.eyebrow}>JustPlayer Example</Text>
          <Text style={styles.subtitle}>Switch between working HLS and MP4 demo sources</Text>

          <View style={styles.row}>
            {Object.entries(SOURCES).map(([key, value]) => {
              const isActive = key === selectedSourceKey;

              return (
                <SourceButton
                  key={key}
                  label={value.label}
                  active={isActive}
                  onPress={() => {
                    setSelectedSourceKey(key as keyof typeof SOURCES);
                  }}
                />
              );
            })}
          </View>

          <VideoView
            key={selectedSourceKey}
            ref={handleVideoRef}
            source={selectedSource.source}
            setup={(nextPlayer) => {
              nextPlayer.play();
            }}
            onLoadStart={handleLoadStart}
            onLoad={handleLoad}
            onError={handleError}
            resizeMode="contain"
            controls={showControls}
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
                const currentPlayer = videoRef.current?.player;
                if (!currentPlayer) {
                  return;
                }
                currentPlayer.seekTo(0);
                currentPlayer.play();
              }}
            />
          </View>

          <View style={styles.row}>
            <ActionButton
              label="Fullscreen"
              onPress={() => {
                videoRef.current?.enterFullscreen();
              }}
            />
            <ActionButton
              label={showControls ? 'Hide Controls' : 'Show Controls'}
              onPress={() => setShowControls(v => !v)}
            />
          </View>

          <View style={styles.panel}>
            <StateRow
              label="source"
              value={selectedSource.label}
            />
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
            <StateRow
              label="loadStart"
              value={truncate(lastLoadStart)}
            />
            <StateRow
              label="onLoad"
              value={truncate(lastLoad)}
            />
            <StateRow
              label="error"
              value={truncate(lastError ?? 'none')}
            />
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function SourceButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, styles.sourceButton, active && styles.sourceButtonActive]}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
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

function truncate(value: string, max = 48) {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
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

  const fractionDigits = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(fractionDigits)} ${units[unitIndex]}`;
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
  subtitle: {
    marginTop: 8,
    color: '#cde7f8',
    fontSize: 15,
    lineHeight: 21
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
  sourceButton: {
    backgroundColor: '#10324b'
  },
  sourceButtonActive: {
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
