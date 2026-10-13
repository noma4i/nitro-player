import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function ActionButton({ label, onPress, testID, active = false }: { label: string; onPress: () => void; testID?: string; active?: boolean }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.button, active && styles.buttonActive]}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

export function Metric({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text testID={testID} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07141b', padding: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  button: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#17313d' },
  buttonActive: { backgroundColor: '#2a6f8a' },
  buttonLabel: { color: '#e8f4f8', fontSize: 13, fontWeight: '600' },
  metric: { minWidth: 96, paddingVertical: 4 },
  metricLabel: { color: '#7fa3b3', fontSize: 11 },
  metricValue: { color: '#e8f4f8', fontSize: 14, fontWeight: '600' }
});
