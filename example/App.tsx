import React, { useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { EXAMPLE_SCREENS, type ExampleScreenKey } from './scenarioModel';
import { RingScreen } from './screens/RingScreen';
import { SurfaceScreen } from './screens/SurfaceScreen';
import { ActionButton } from './ui';

function App() {
  const [screen, setScreen] = useState<ExampleScreenKey>('surface');
  const active = EXAMPLE_SCREENS.find(entry => entry.key === screen) ?? EXAMPLE_SCREENS[0];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={appStyles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={appStyles.header}>
          <Text style={appStyles.eyebrow}>NitroPlay Example</Text>
          <Text style={appStyles.headline}>{active.label}</Text>
          <Text style={appStyles.summary}>{active.headline}</Text>
          <View style={appStyles.tabs}>
            {EXAMPLE_SCREENS.map(entry => (
              <ActionButton key={entry.key} testID={`tab-${entry.key}`} label={entry.label} active={entry.key === screen} onPress={() => setScreen(entry.key)} />
            ))}
          </View>
        </View>
        {screen === 'surface' ? <SurfaceScreen /> : <RingScreen />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const appStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07141b' },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  eyebrow: { color: '#7fa3b3', fontSize: 12 },
  headline: { color: '#e8f4f8', fontSize: 22, fontWeight: '700' },
  summary: { color: '#a9c4d0', fontSize: 13, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 10 }
});

export default App;
