import React, { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Text, View, type AppStateStatus } from 'react-native';
import {
  NitroPlayerView,
  usePlaybackState,
  type NitroPlayer,
  type NitroPlayerViewRef,
} from '@noma4i/nitro-play';
import { LONG_HLS_SOURCE } from '../scenarioModel';
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

const SCREEN_KEY = 'bg-lifecycle';

// BackgroundLifecycle: play a stream and log AppState active/background
// transitions. The playInBackground toggle exercises the background-audio path
// and the suspend/resume teardown ordering.
export function BackgroundLifecycleScreen() {
  const viewRef = useRef<NitroPlayerViewRef | null>(null);
  const [player, setPlayer] = useState<NitroPlayer | null>(null);
  const [appStateValue, setAppStateValue] = useState<AppStateStatus>(AppState.currentState);
  const [playInBackground, setPlayInBackground] = useState(false);
  const [lastError, setLastError] = useState('none');
  const [log, setLog] = useState<string[]>([]);

  const playbackState = usePlaybackState(player);
  const status = playbackState?.status ?? 'idle';

  const pushLog = (line: string) => setLog(current => appendLog(current, line));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      setAppStateValue(nextState);
      pushLog(`app state -> ${nextState}`);
    });
    return () => subscription.remove();
  }, []);

  // Apply the playInBackground flag to the live player whenever it toggles.
  useEffect(() => {
    const activePlayer = viewRef.current?.player;
    if (!activePlayer) {
      return;
    }
    try {
      activePlayer.playInBackground = playInBackground;
      pushLog(`playInBackground = ${playInBackground ? 'on' : 'off'}`);
    } catch (error) {
      setLastError(toErrorMessage(error));
    }
  }, [playInBackground, player]);

  const togglePlay = () => {
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
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle
        title="Background Lifecycle"
        subtitle="Play a stream and log AppState active/background transitions. Toggle playInBackground, then background the app to observe behavior."
      />

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle}>Background Target</Text>
            <Text style={styles.cardDescription}>Long HLS stream. Background the app to test suspend/resume.</Text>
          </View>
        </View>

        <NitroPlayerView
          ref={instance => {
            viewRef.current = instance;
            setPlayer(instance?.player ?? null);
          }}
          source={LONG_HLS_SOURCE}
          playerDefaults={{ loop: true }}
          resizeMode="contain"
          keepScreenAwake
          surfaceType="texture"
          style={styles.playerView}
          testID={`${SCREEN_KEY}-player`}
          accessibilityLabel={`${SCREEN_KEY}-player`}
        />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label={status === 'playing' ? 'Pause' : 'Play'}
          testID={`${SCREEN_KEY}-toggle-play`}
          onPress={togglePlay}
        />
        <ActionButton
          label={playInBackground ? 'BG Audio On' : 'BG Audio Off'}
          active={playInBackground}
          testID={`${SCREEN_KEY}-toggle-background`}
          onPress={() => setPlayInBackground(value => !value)}
        />
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
        <Metric label="app state" value={appStateValue} testID={`${SCREEN_KEY}-metric-appstate`} />
        <Metric
          label="bg audio"
          value={playInBackground ? 'on' : 'off'}
          testID={`${SCREEN_KEY}-metric-background`}
        />
        <Metric label="last error" value={truncate(lastError)} testID={`${SCREEN_KEY}-metric-error`} />
      </View>

      <EventLog entries={log} testID={`${SCREEN_KEY}-log`} />
    </ScrollView>
  );
}
