import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  NitroPlayerView,
  usePlaybackState,
  type NitroPlayer,
} from '@noma4i/nitro-play';
import { SWAP_SOURCES } from '../scenarioModel';
import {
  ActionButton,
  EventLog,
  Metric,
  SectionTitle,
  appendLog,
  formatSeconds,
  styles,
  toErrorMessage,
  truncate,
  usePlayerViewHandle,
} from '../shared';

const SCREEN_KEY = 'source-swap';
const RAPID_SWAP_COUNT = 10;

// SourceSwapStress: a single player whose source is swapped via
// replaceSourceAsync between two HERO sources, including a rapid x10 loop while
// playing. replaceSourceAsync mid-playback is a generation-safety crash vector.
export function SourceSwapStressScreen() {
  const [player, setPlayer] = useState<NitroPlayer | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [swaps, setSwaps] = useState(0);
  const [lastError, setLastError] = useState('none');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const rapidRef = useRef(false);

  const playbackState = usePlaybackState(player);
  const status = playbackState?.status ?? 'idle';
  const activeSource = SWAP_SOURCES[sourceIndex];
  const handlePlayerChange = React.useCallback((nextPlayer: NitroPlayer | null) => setPlayer(nextPlayer), []);
  const { viewRef, ref: playerViewRef } = usePlayerViewHandle({ onPlayerChange: handlePlayerChange });

  const pushLog = (line: string) => setLog(current => appendLog(current, line));

  useEffect(() => {
    // Stop any in-flight rapid loop when the screen unmounts.
    return () => {
      rapidRef.current = false;
    };
  }, []);

  const swapTo = async (nextIndex: number, reason: string) => {
    const activePlayer = viewRef.current?.player;
    if (!activePlayer) {
      setLastError('player unavailable');
      pushLog('swap skipped: player unavailable');
      return;
    }
    try {
      await activePlayer.replaceSourceAsync(SWAP_SOURCES[nextIndex].source);
      setSourceIndex(nextIndex);
      setSwaps(current => current + 1);
      pushLog(`${reason} -> ${SWAP_SOURCES[nextIndex].label}`);
    } catch (error) {
      const message = toErrorMessage(error);
      setLastError(message);
      pushLog(`swap error: ${message}`);
    }
  };

  const toggleSwap = async () => {
    setBusy(true);
    try {
      const next = (sourceIndex + 1) % SWAP_SOURCES.length;
      await swapTo(next, 'manual swap');
    } finally {
      setBusy(false);
    }
  };

  const rapidSwap = async () => {
    if (rapidRef.current) {
      return;
    }
    rapidRef.current = true;
    setBusy(true);
    pushLog(`rapid swap x${RAPID_SWAP_COUNT} started`);
    try {
      const activePlayer = viewRef.current?.player;
      if (activePlayer) {
        try {
          activePlayer.play();
        } catch (error) {
          setLastError(toErrorMessage(error));
        }
      }
      let cursor = sourceIndex;
      for (let i = 0; i < RAPID_SWAP_COUNT; i += 1) {
        if (!rapidRef.current) {
          break;
        }
        cursor = (cursor + 1) % SWAP_SOURCES.length;
        await swapTo(cursor, `rapid ${i + 1}/${RAPID_SWAP_COUNT}`);
      }
      pushLog('rapid swap done');
    } finally {
      rapidRef.current = false;
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle
        title="Source Swap Stress"
        subtitle="One player, replaceSourceAsync between two HERO sources. Rapid swap loops replaceSourceAsync x10 while playing."
      />

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle}>Swap Target</Text>
            <Text style={styles.cardDescription}>Active source: {activeSource.label}</Text>
          </View>
        </View>

        <NitroPlayerView
          ref={playerViewRef}
          source={activeSource.source}
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
          label="Swap Source"
          active={busy}
          testID={`${SCREEN_KEY}-swap`}
          onPress={() => {
            toggleSwap().catch(() => {});
          }}
        />
        <ActionButton
          label={`Rapid Swap x${RAPID_SWAP_COUNT}`}
          active={rapidRef.current}
          testID={`${SCREEN_KEY}-rapid-swap`}
          onPress={() => {
            rapidSwap().catch(() => {});
          }}
        />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label="Reset Counters"
          testID={`${SCREEN_KEY}-reset`}
          onPress={() => {
            setSwaps(0);
            setLastError('none');
            pushLog('counters reset');
          }}
        />
      </View>

      <View style={styles.metricsGrid}>
        <Metric label="status" value={status} testID={`${SCREEN_KEY}-metric-status`} />
        <Metric label="active source" value={activeSource.label} testID={`${SCREEN_KEY}-metric-source`} />
        <Metric label="swaps" value={String(swaps)} testID={`${SCREEN_KEY}-metric-swaps`} />
        <Metric label="time" value={formatSeconds(playbackState?.currentTime ?? 0)} testID={`${SCREEN_KEY}-metric-time`} />
        <Metric label="last error" value={truncate(lastError)} testID={`${SCREEN_KEY}-metric-error`} />
      </View>

      <EventLog entries={log} testID={`${SCREEN_KEY}-log`} />
    </ScrollView>
  );
}
