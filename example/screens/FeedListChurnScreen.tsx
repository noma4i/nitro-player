import React, { useCallback, useRef, useState } from 'react';
import { FlatList, View, type ListRenderItemInfo, type ViewToken } from 'react-native';
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
      // The card chrome stays mounted for every rendered row; only the video
      // surface mounts for viewable rows (active prop). Keeping a constant row
      // height avoids the viewability -> height-change -> re-measure flicker loop.
      const isViewable = viewableKeys.has(item.key);
      // Description and source are kept constant (independent of viewability) so
      // the row height never changes: only `active` toggles the video surface.
      return (
        <PlayerWorkbench
          title={item.title}
          chip={`row ${index + 1}`}
          description={item.note}
          source={buildChurnRowSource(item, false)}
          accent={item.tone}
          active={isViewable}
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
