import type { NitroFeedRingSlotId } from './NitroFeedRingPlayer';

const FEED_RING_SLOT_COUNT = 3;
const FEED_RING_WINDOW_OFFSETS = [-1, 0, 1] as const;

const positiveMod = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor;

export interface FeedRingSlotAssignment<TEntry> {
  slotId: NitroFeedRingSlotId;
  assignedIndex: number;
  entry: TEntry | null;
}

export const resolveFeedRingSlotId = (index: number): NitroFeedRingSlotId => positiveMod(index, FEED_RING_SLOT_COUNT) as NitroFeedRingSlotId;

export const feedRingWindowIndices = (centerIndex: number): number[] => FEED_RING_WINDOW_OFFSETS.map(offset => centerIndex + offset);

export const resolveFeedRingSlotAssignments = <TEntry>(entries: ReadonlyArray<TEntry | null>, centerIndex: number): Array<FeedRingSlotAssignment<TEntry>> =>
  feedRingWindowIndices(centerIndex).map(assignedIndex => ({
    slotId: resolveFeedRingSlotId(assignedIndex),
    assignedIndex,
    entry: assignedIndex >= 0 && assignedIndex < entries.length ? (entries[assignedIndex] ?? null) : null
  }));
