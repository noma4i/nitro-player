import React, { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  NitroPlayerView,
  useEvent,
  usePlaybackState,
  type NitroPlayer,
  type NitroPlayerViewRef,
  type PlaybackError,
} from '@noma4i/nitro-play';
import { LONG_HLS_SOURCE } from '../scenarioModel';
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
} from '../shared';

const SCREEN_KEY = 'buffer-interrupt';

// BufferingInterrupt: play a long HLS source, then tear it down with release()
// or clearSourceAsync() (and a play-then-immediately-release combo) while it is
// still buffering. Exercises the buffering -> teardown emit-after-release path.
export function BufferingInterruptScreen() {
  const viewRef = useRef<NitroPlayerViewRef | null>(null);
  const [player, setPlayer] = useState<NitroPlayer | null>(null);
  const [released, setReleased] = useState(false);
  const [lastError, setLastError] = useState('none');
  const [log, setLog] = useState<string[]>([]);

  const playbackState = usePlaybackState(player);
  const status = playbackState?.status ?? 'idle';

  const pushLog = (line: string) => setLog(current => appendLog(current, line));

  useEvent(player, 'onError', (error: PlaybackError) => {
    const message = `${error.code}: ${error.message}`;
    setLastError(message);
    pushLog(`onError ${message}`);
  });

  const withPlayer = (label: string, fn: (instance: NitroPlayer) => void) => {
    const activePlayer = viewRef.current?.player;
    if (!activePlayer) {
      pushLog(`${label} skipped: no player`);
      return;
    }
    try {
      fn(activePlayer);
      pushLog(`${label} ok`);
    } catch (error) {
      const message = toErrorMessage(error);
      setLastError(message);
      pushLog(`${label} error: ${message}`);
    }
  };

  const callRelease = () => {
    withPlayer('release', instance => {
      instance.release();
      setReleased(true);
    });
  };

  const callClearSource = () => {
    const activePlayer = viewRef.current?.player;
    if (!activePlayer) {
      pushLog('clearSourceAsync skipped: no player');
      return;
    }
    activePlayer
      .clearSourceAsync()
      .then(() => pushLog('clearSourceAsync ok'))
      .catch(error => {
        const message = toErrorMessage(error);
        setLastError(message);
        pushLog(`clearSourceAsync error: ${message}`);
      });
  };

  // play() then release() back-to-back: release lands while the play-triggered
  // load/buffer is still in flight - the strongest interrupt combo.
  const playThenRelease = () => {
    withPlayer('play+release: play', instance => instance.play());
    withPlayer('play+release: release', instance => {
      instance.release();
      setReleased(true);
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle
        title="Buffering Interrupt"
        subtitle="Play a long HLS stream, then release() or clearSourceAsync() mid-buffer. The play-then-release combo interrupts an in-flight load."
      />

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle}>HLS Buffer Target</Text>
            <Text style={styles.cardDescription}>
              {released ? 'player released - remount the screen to retry' : 'long HLS source, lazy startup'}
            </Text>
          </View>
        </View>

        {released ? (
          <View style={styles.utilityPreviewPlaceholder} testID={`${SCREEN_KEY}-released-placeholder`}>
            <Text style={styles.utilityPreviewPlaceholderText}>player released - native resources gone</Text>
          </View>
        ) : (
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
        )}
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label={status === 'playing' ? 'Pause' : 'Play'}
          disabled={released}
          testID={`${SCREEN_KEY}-toggle-play`}
          onPress={() =>
            withPlayer('toggle play', instance => {
              if (status === 'playing') {
                instance.pause();
              } else {
                instance.play();
              }
            })
          }
        />
        <ActionButton
          label="Release"
          disabled={released}
          testID={`${SCREEN_KEY}-release`}
          onPress={callRelease}
        />
        <ActionButton
          label="Clear Source"
          disabled={released}
          testID={`${SCREEN_KEY}-clear-source`}
          onPress={callClearSource}
        />
      </View>

      <View style={styles.buttonRow}>
        <ActionButton
          label="Play then Release"
          disabled={released}
          testID={`${SCREEN_KEY}-play-then-release`}
          onPress={playThenRelease}
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
        <Metric label="released" value={released ? 'yes' : 'no'} testID={`${SCREEN_KEY}-metric-released`} />
        <Metric label="buffer" value={formatSeconds(playbackState?.bufferDuration ?? 0)} testID={`${SCREEN_KEY}-metric-buffer`} />
        <Metric label="last error" value={truncate(lastError)} testID={`${SCREEN_KEY}-metric-error`} />
      </View>

      <EventLog entries={log} testID={`${SCREEN_KEY}-log`} />
    </ScrollView>
  );
}
