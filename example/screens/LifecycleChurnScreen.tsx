import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { HERO_SOURCES } from '../scenarioModel';
import {
  ActionButton,
  EventLog,
  Metric,
  PlayerWorkbench,
  SectionTitle,
  appendLog,
  styles,
} from '../shared';

const SCREEN_KEY = 'lifecycle-churn';
const CHURN_INTERVAL_MS = 800;

// LifecycleChurn: conditionally mount/unmount the player while it plays. This
// is the direct emit-after-release trigger - unmounting the NitroPlayerView
// tears down its native player while playback callbacks may still be in flight.
export function LifecycleChurnScreen() {
  const [mounted, setMounted] = useState(true);
  const [autoChurn, setAutoChurn] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushLog = (line: string) => setLog(current => appendLog(current, line));

  const toggleMount = () => {
    setMounted(current => {
      const next = !current;
      pushLog(next ? 'manual mount' : 'manual unmount');
      return next;
    });
  };

  useEffect(() => {
    if (!autoChurn) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    pushLog('auto churn started');
    intervalRef.current = setInterval(() => {
      setMounted(current => !current);
      setCycles(current => current + 1);
    }, CHURN_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoChurn]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle
        title="Lifecycle Churn"
        subtitle="Mount and unmount the player while playing to trigger emit-after-release. Auto churn toggles mount state every ~800ms."
      />

      <View style={styles.buttonRow}>
        <ActionButton
          label={mounted ? 'Unmount' : 'Mount'}
          active={mounted}
          testID={`${SCREEN_KEY}-toggle-mount`}
          onPress={toggleMount}
        />
        <ActionButton
          label={autoChurn ? 'Stop Auto Churn' : 'Auto Churn'}
          active={autoChurn}
          testID={`${SCREEN_KEY}-toggle-auto`}
          onPress={() => setAutoChurn(value => !value)}
        />
        <ActionButton
          label="Reset Cycles"
          testID={`${SCREEN_KEY}-reset`}
          onPress={() => {
            setCycles(0);
            pushLog('cycles reset');
          }}
        />
      </View>

      <View style={styles.metricsGrid}>
        <Metric label="mounted" value={mounted ? 'yes' : 'no'} testID={`${SCREEN_KEY}-metric-mounted`} />
        <Metric label="auto churn" value={autoChurn ? 'on' : 'off'} testID={`${SCREEN_KEY}-metric-auto`} />
        <Metric label="cycles" value={String(cycles)} testID={`${SCREEN_KEY}-metric-cycles`} />
      </View>

      {mounted ? (
        <PlayerWorkbench
          title="Churn Target"
          chip="mount/unmount"
          description="This player is mounted and unmounted while playing. Native teardown races in-flight playback callbacks."
          source={HERO_SOURCES.startupProxy.source}
          accent="#ec5f67"
          testID={`${SCREEN_KEY}-workbench`}
        />
      ) : (
        <View style={styles.utilityPreviewPlaceholder} testID={`${SCREEN_KEY}-unmounted-placeholder`}>
          <Text style={styles.utilityPreviewPlaceholderText}>player unmounted - native resources released</Text>
        </View>
      )}

      <EventLog entries={log} testID={`${SCREEN_KEY}-log`} />
    </ScrollView>
  );
}
