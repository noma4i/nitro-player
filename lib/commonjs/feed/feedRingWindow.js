"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resolveFeedRingSlotId = exports.resolveFeedRingSlotAssignments = exports.feedRingWindowIndices = void 0;
const FEED_RING_SLOT_COUNT = 3;
const FEED_RING_WINDOW_OFFSETS = [-1, 0, 1];
const positiveMod = (value, divisor) => (value % divisor + divisor) % divisor;
const resolveFeedRingSlotId = index => positiveMod(index, FEED_RING_SLOT_COUNT);
exports.resolveFeedRingSlotId = resolveFeedRingSlotId;
const feedRingWindowIndices = centerIndex => FEED_RING_WINDOW_OFFSETS.map(offset => centerIndex + offset);
exports.feedRingWindowIndices = feedRingWindowIndices;
const resolveFeedRingSlotAssignments = (entries, centerIndex) => feedRingWindowIndices(centerIndex).map(assignedIndex => ({
  slotId: resolveFeedRingSlotId(assignedIndex),
  assignedIndex,
  entry: assignedIndex >= 0 && assignedIndex < entries.length ? entries[assignedIndex] ?? null : null
}));
exports.resolveFeedRingSlotAssignments = resolveFeedRingSlotAssignments;
//# sourceMappingURL=feedRingWindow.js.map