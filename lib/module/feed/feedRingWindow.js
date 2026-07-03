"use strict";

const FEED_RING_SLOT_COUNT = 3;
const FEED_RING_WINDOW_OFFSETS = [-1, 0, 1];
const positiveMod = (value, divisor) => (value % divisor + divisor) % divisor;
export const resolveFeedRingSlotId = index => positiveMod(index, FEED_RING_SLOT_COUNT);
export const feedRingWindowIndices = centerIndex => FEED_RING_WINDOW_OFFSETS.map(offset => centerIndex + offset);
export const resolveFeedRingSlotAssignments = (entries, centerIndex) => feedRingWindowIndices(centerIndex).map(assignedIndex => ({
  slotId: resolveFeedRingSlotId(assignedIndex),
  assignedIndex,
  entry: assignedIndex >= 0 && assignedIndex < entries.length ? entries[assignedIndex] ?? null : null
}));
//# sourceMappingURL=feedRingWindow.js.map