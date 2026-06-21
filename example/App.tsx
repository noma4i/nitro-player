import React, { useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChipButton } from './shared';
import { HomeScreen } from './screens/HomeScreen';
import { LifecycleChurnScreen } from './screens/LifecycleChurnScreen';
import { SourceSwapStressScreen } from './screens/SourceSwapStressScreen';
import { FeedListChurnScreen } from './screens/FeedListChurnScreen';
import { BufferingInterruptScreen } from './screens/BufferingInterruptScreen';
import { BackgroundLifecycleScreen } from './screens/BackgroundLifecycleScreen';
import { PreloadRaceScreen } from './screens/PreloadRaceScreen';

// In-app screen selector. A simple `screen` state switches the rendered
// scenario - no navigation library, just a horizontal chip bar at the top.
// Each scenario screen is self-contained and isolates its own player lifecycle.
const SCREENS = [
  { key: 'home', label: 'Home', render: () => <HomeScreen /> },
  { key: 'lifecycle-churn', label: 'Lifecycle Churn', render: () => <LifecycleChurnScreen /> },
  { key: 'source-swap', label: 'Source Swap', render: () => <SourceSwapStressScreen /> },
  { key: 'feed-list', label: 'Feed List Churn', render: () => <FeedListChurnScreen /> },
  { key: 'buffer-interrupt', label: 'Buffer Interrupt', render: () => <BufferingInterruptScreen /> },
  { key: 'bg-lifecycle', label: 'Background', render: () => <BackgroundLifecycleScreen /> },
  { key: 'preload-race', label: 'Preload Race', render: () => <PreloadRaceScreen /> }
] as const;

type ScreenKey = (typeof SCREENS)[number]['key'];

function App() {
  const [screen, setScreen] = useState<ScreenKey>('home');
  const activeScreen = SCREENS.find(item => item.key === screen) ?? SCREENS[0];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.selectorBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorContent}>
            {SCREENS.map(item => (
              <ChipButton
                key={item.key}
                label={item.label}
                active={item.key === screen}
                testID={`nav-${item.key}`}
                onPress={() => setScreen(item.key)}
              />
            ))}
          </ScrollView>
        </View>
        <View style={styles.screenHost}>{activeScreen.render()}</View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07141b'
  },
  selectorBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#173039',
    backgroundColor: '#091821'
  },
  selectorContent: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  screenHost: {
    flex: 1
  }
});

export default App;
