import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Text, View, type ListRenderItemInfo, type ViewToken } from 'react-native';
import { CHURN_LIST_ITEMS, buildChurnRowSource, type ChurnListItem } from '../scenarioModel';
import { Metric, PlayerWorkbench, SectionTitle, styles } from '../shared';

const SCREEN_KEY = 'feed-list';

// FeedListChurn: a FlatList of ~30 rows. A player is mounted only for the rows
// currently reported as viewable, so scrolling continuously churns
// mount/unmount as FlatList recycles - the realistic feed crash path.
export function FeedListChurnScreen() {
  const [viewableKeys, setViewableKeys] = useState<Set<string>>(() => new Set([CHURN_LIST_ITEMS[0]?.key]));

  // FlatList requires stable identities for these two between renders.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const nextKeys = new Set<string>();
    for (const token of viewableItems) {
      if (token.isViewable && token.item) {
        nextKeys.add((token.item as ChurnListItem).key);
      }
    }
    setViewableKeys(nextKeys);
  }).current;

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ChurnListItem>) => {
      const isMounted = viewableKeys.has(item.key);
      if (!isMounted) {
        return (
          <View style={styles.consumerColdRow} testID={`${SCREEN_KEY}-cold-${index}`}>
            <View style={styles.consumerColdIndex}>
              <Text style={styles.consumerColdIndexText}>{index + 1}</Text>
            </View>
            <View style={styles.consumerColdContent}>
              <Text style={styles.consumerColdTitle}>{item.title}</Text>
              <Text style={styles.consumerColdText}>{item.note}</Text>
              <Text style={styles.consumerColdText}>offscreen: player unmounted</Text>
            </View>
          </View>
        );
      }

      return (
        <PlayerWorkbench
          title={item.title}
          chip={`row ${index + 1}`}
          description={`${item.note} Mounted because viewable - scroll away to unmount.`}
          source={buildChurnRowSource(item, true)}
          accent={item.tone}
          testID={`${SCREEN_KEY}-row-${index}`}
          compact
        />
      );
    },
    [viewableKeys]
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={CHURN_LIST_ITEMS}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        extraData={viewableKeys}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        testID={`${SCREEN_KEY}-list`}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.feedColumn}>
            <SectionTitle
              title="Feed List Churn"
              subtitle="A 30-row FlatList. Only viewable rows mount a player, so scrolling churns mount/unmount through list recycling."
            />
            <View style={styles.metricsGrid}>
              <Metric label="rows" value={String(CHURN_LIST_ITEMS.length)} testID={`${SCREEN_KEY}-metric-rows`} />
              <Metric label="mounted" value={String(viewableKeys.size)} testID={`${SCREEN_KEY}-metric-mounted`} />
            </View>
          </View>
        }
      />
    </View>
  );
}
