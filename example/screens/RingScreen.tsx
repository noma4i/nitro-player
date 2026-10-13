import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Text, View, type FlatListProps } from "react-native";
import { NitroFeedRingSlotView, resolveFeedRingSlotId, useNitroFeedRingHost } from '@noma4i/nitro-play';
import { buildRingCatalogItems } from '../scenarioModel';
import { ActionButton, Metric, styles } from '../ui';

const ITEM_HEIGHT = 220;

export function RingScreen() {
  const catalog = useMemo(() => ({ revision: 1, items: buildRingCatalogItems() }), []);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [playbackAllowed, setPlaybackAllowed] = useState(true);
  const activeIndexRef = useRef(0);

  const host = useNitroFeedRingHost({
    hostKey: 'example-ring',
    context: 'ring',
    focused: true,
    playbackAllowed,
    muted,
    catalog,
    getViewport: () => ({ windowCenterIndex: activeIndexRef.current, playbackIndex: activeIndexRef.current })
  });
  const { publishViewport } = host;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null; isViewable: boolean }> }) => {
    const first = viewableItems.find(token => token.isViewable && typeof token.index === 'number');
    if (first && typeof first.index === 'number' && first.index !== activeIndexRef.current) {
      activeIndexRef.current = first.index;
      setActiveIndex(first.index);
      publishViewport();
    }
  });

  const renderItem = useCallback(
    ({ item }: { item: (typeof catalog.items)[number] }) => {
      const inWindow = Math.abs(item.index - activeIndex) <= 1;
      return (
        <View style={{ height: ITEM_HEIGHT, padding: 8 }} testID={`ring-item-${item.index}`}>
          {inWindow && host.binding ? (
            <NitroFeedRingSlotView ring={host.binding.ring} slotId={resolveFeedRingSlotId(item.index)} style={{ flex: 1 }} />
          ) : (
            <View style={{ flex: 1, backgroundColor: '#0d222c' }} />
          )}
          <Text style={{ color: '#e8f4f8' }}>{item.itemId}</Text>
        </View>
      );
    },
    [activeIndex, host.binding]
  );

  return (
    <View style={styles.screen} testID="screen-ring">
      <View style={styles.row}>
        <Metric label="Active" value={String(activeIndex)} testID="metric-active-index" />
        <Metric label="Ring active" value={String(host.isActive)} testID="metric-ring-active" />
        <ActionButton testID="btn-ring-mute" label={muted ? 'Unmute' : 'Mute'} active={muted} onPress={() => setMuted(value => !value)} />
        <ActionButton testID="btn-ring-play" label={playbackAllowed ? 'Pause ring' : 'Resume ring'} active={playbackAllowed} onPress={() => setPlaybackAllowed(value => !value)} />
      </View>
      <FlatList
        data={catalog.items}
        keyExtractor={item => String(item.itemId)}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        pagingEnabled
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
        onViewableItemsChanged={onViewableItemsChanged.current as FlatListProps<unknown>["onViewableItemsChanged"]}
      />
    </View>
  );
}
