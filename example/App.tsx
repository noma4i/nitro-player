import React, { useMemo, useState, type ComponentType } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChipButton } from './shared';
import { HomeScreen } from './screens/HomeScreen';
import { LifecycleChurnScreen } from './screens/LifecycleChurnScreen';
import { SourceSwapStressScreen } from './screens/SourceSwapStressScreen';
import { FeedListChurnScreen } from './screens/FeedListChurnScreen';
import { BufferingInterruptScreen } from './screens/BufferingInterruptScreen';
import { BackgroundLifecycleScreen } from './screens/BackgroundLifecycleScreen';
import { PreloadRaceScreen } from './screens/PreloadRaceScreen';
import { EXAMPLE_SCREEN_CATALOG, EXAMPLE_SCREEN_GROUPS, getExampleScreen, getExampleScreenCountByGroup, type ExampleScreenKey } from './scenarioModel';

const SCREEN_COMPONENTS: Record<ExampleScreenKey, ComponentType> = {
  home: HomeScreen,
  'lifecycle-churn': LifecycleChurnScreen,
  'source-swap': SourceSwapStressScreen,
  'feed-list': FeedListChurnScreen,
  'buffer-interrupt': BufferingInterruptScreen,
  'bg-lifecycle': BackgroundLifecycleScreen,
  'preload-race': PreloadRaceScreen
};

function App() {
  const [screen, setScreen] = useState<ExampleScreenKey>('home');
  const activeScreen = getExampleScreen(screen);
  const ActiveScreen = SCREEN_COMPONENTS[activeScreen.key];
  const activeGroup = EXAMPLE_SCREEN_GROUPS.find(group => group.key === activeScreen.group) ?? EXAMPLE_SCREEN_GROUPS[0];
  const groupSummary = useMemo(
    () =>
      EXAMPLE_SCREEN_GROUPS.map(group => ({
        ...group,
        count: getExampleScreenCountByGroup(group.key)
      })),
    []
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#07141b"
        />
        <View style={styles.appHeader}>
          <View style={styles.titleBlock}>
            <Text style={styles.eyebrow}>NitroPlay Example</Text>
            <Text style={styles.headline}>{activeScreen.label}</Text>
            <Text style={styles.summary}>{activeScreen.headline}</Text>
          </View>
          <View style={styles.contractPanel}>
            <View style={[styles.groupPill, { borderColor: activeGroup.accent }]}>
              <Text style={[styles.groupPillLabel, { color: activeGroup.accent }]}>{activeGroup.label}</Text>
            </View>
            <Text style={styles.contractText}>{activeScreen.contract}</Text>
          </View>
          <View style={styles.coverageRow}>
            {groupSummary.map(group => (
              <View
                key={group.key}
                style={styles.coverageItem}>
                <Text style={[styles.coverageCount, { color: group.accent }]}>{group.count}</Text>
                <View style={styles.coverageTextBlock}>
                  <Text style={styles.coverageLabel}>{group.label}</Text>
                  <Text style={styles.coverageSummary}>{group.summary}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.selectorBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorContent}>
            {EXAMPLE_SCREEN_CATALOG.map(item => (
              <ChipButton
                key={item.key}
                label={item.shortLabel}
                active={item.key === screen}
                testID={`nav-${item.key}`}
                onPress={() => setScreen(item.key)}
              />
            ))}
          </ScrollView>
        </View>
        <View style={styles.screenHost}>
          <ActiveScreen />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07141b'
  },
  appHeader: {
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: '#07141b',
    borderBottomWidth: 1,
    borderBottomColor: '#142d36'
  },
  titleBlock: {
    gap: 5
  },
  eyebrow: {
    color: '#8cc7ff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  headline: {
    color: '#f6fbff',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900'
  },
  summary: {
    color: '#a9c6d4',
    fontSize: 14,
    lineHeight: 20
  },
  contractPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#0c1d24',
    borderWidth: 1,
    borderColor: '#1a3541'
  },
  groupPill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#07141b'
  },
  groupPillLabel: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  contractText: {
    flex: 1,
    minWidth: 180,
    color: '#deedf4',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  coverageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  coverageItem: {
    flex: 1,
    minWidth: 150,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#091821',
    borderWidth: 1,
    borderColor: '#183441'
  },
  coverageCount: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900'
  },
  coverageTextBlock: {
    flex: 1,
    gap: 3
  },
  coverageLabel: {
    color: '#eff8fc',
    fontSize: 13,
    fontWeight: '900'
  },
  coverageSummary: {
    color: '#89aabd',
    fontSize: 12,
    lineHeight: 16
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
