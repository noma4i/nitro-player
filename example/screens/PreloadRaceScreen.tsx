import React, { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  NitroPlayerView,
  usePlaybackState,
  type NitroPlayer,
  type NitroPlayerViewRef,
} from '@noma4i/nitro-play';
import { SWAP_SOURCES } from '../scenarioModel';
import {
  ActionButton,
  EventLog,
  Metric,
  SectionTitle,
  appendLog,
  styles,
  toErrorMessage,
  truncate,
} from '../shared';

const SCREEN_KEY = 'preload-race';

// PreloadRace: kick off preload() and immediately release() or
// replaceSourceAsync() before it resolves. The async preload promise resolving
// after teardown is the generation-safety race this screen targets.
export function PreloadRaceScreen() {
  const viewRef = useRef<NitroPlayerViewRef | null>(null);
  const [player, setPlayer] = useState<NitroPlayer | null>(null);
  const [released, setReleased] = useState(false);
  const [preloadState, setPreloadState] = useState('idle');
  const [lastError, setLastError] = useState('none');
  const [log, setLog] = useState<string[]>([]);

  const playbackState = usePlaybackState(player);
  const status = playbackState?.status ?? 'idle';

  const pushLog = (line: string) => setLog(current => appendLog(current, line));

  const startPreload = () => {
    const activePlayer = viewRef.current?.player;
    if (!activePlayer) {
      pushLog('preload skipped: no player');
      return;
    }
    setPreloadState('preloading');
    pushLog('preload started');
    activePlayer
      .preload()
      .then(() => {
        setPreloadState('preloaded');
        pushLog('preload resolved');
      })
      .catch(error => {
        const message = toErrorMessage(error);
        setPreloadState('preload failed');
        setLastError(message);
        pushLog(`preload error: ${message}`);
      });
  };

  // preload() then release() with no await: release lands while the preload
  // promise is still pending, so it must resolve/reject against a torn-down player.
  const preloadThenRelease = () => {
    startPreload();
    const activePlayer = viewRef.current?.player;
    if (!activePlayer) {
      return;
    }
    try {
      activePlayer.release();
      setReleased(true);
      pushLog('release during preload');
    } catch (error) {
      const message = toErrorMessage(error);
      setLastError(message);
      pushLog(`release error: ${message}`);
    }
  };

  // preload() then immediately swap the source mid-flight.
  const preloadThenSwap = () => {
    startPreload();
    const activePlayer = viewRef.current?.player;
    if (!activePlayer) {
      return;
    }
    activePlayer
      .replaceSourceAsync(SWAP_SOURCES[1].source)
      .then(() => pushLog('replaceSourceAsync during preload ok'))
      .catch(error => {
        const message = toErrorMessage(error);
        setLastError(message);
        pushLog(`replace during preload error: ${message}`);
      });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle
        title="Preload Race"
        subtitle="Start preload() then immediately release() or replaceSourceAsync() before it resolves, racing teardown against the pending preload."
      />

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle}>Preload Target</Text>
            <Text style={styles.cardDescription}>
              {released ? 'player released - remount the screen to retry' : `source: ${SWAP_SOURCES[0].label}`}
            </Text>
          </View>
        </View>

        {released ? (
          <View style={styles.utilityPreviewPlaceholder} testID={`${SCREEN_KEY}-released-placeholder`}>
            <Text style={styles.utilityPreviewPlaceholderText}>player released during preload</Text>
          </View>
        ) : (
          <NitroPlayerView
            ref={instance => {
              viewRef.current = instance;
              setPlayer(instance?.player ?? null);
            }}
            source={SWAP_SOURCES[0].source}
            playerDefaults={{ loop: true }}
            resizeMode="contain"
            keepScreenAwake
            surfaceType="texture"
            style={styles.playerView}
            testID={`${SCREEN_KEY}-player`}
            accessibilityLabel={`${SCREEN_KEY}-player`}
          />
        )}
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label="Preload"
          disabled={released}
          testID={`${SCREEN_KEY}-preload`}
          onPress={startPreload}
        />
        <ActionButton
          label="Preload + Release"
          disabled={released}
          testID={`${SCREEN_KEY}-preload-release`}
          onPress={preloadThenRelease}
        />
        <ActionButton
          label="Preload + Swap"
          disabled={released}
          testID={`${SCREEN_KEY}-preload-swap`}
          onPress={preloadThenSwap}
        />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label="Clear Log"
          testID={`${SCREEN_KEY}-clear-log`}
          onPress={() => {
            setLog([]);
            setLastError('none');
          }}
        />
      </View>

      <View style={styles.metricsGrid}>
        <Metric label="status" value={status} testID={`${SCREEN_KEY}-metric-status`} />
        <Metric label="preload" value={preloadState} testID={`${SCREEN_KEY}-metric-preload`} />
        <Metric label="released" value={released ? 'yes' : 'no'} testID={`${SCREEN_KEY}-metric-released`} />
        <Metric label="last error" value={truncate(lastError)} testID={`${SCREEN_KEY}-metric-error`} />
      </View>

      <EventLog entries={log} testID={`${SCREEN_KEY}-log`} />
    </ScrollView>
  );
}
