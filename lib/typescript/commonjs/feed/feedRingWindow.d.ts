import type { NitroFeedRingSlotId } from './NitroFeedRingPlayer';
export interface FeedRingSlotAssignment<TEntry> {
    slotId: NitroFeedRingSlotId;
    assignedIndex: number;
    entry: TEntry | null;
}
export declare const resolveFeedRingSlotId: (index: number) => NitroFeedRingSlotId;
export declare const feedRingWindowIndices: (centerIndex: number) => number[];
export declare const resolveFeedRingSlotAssignments: <TEntry>(entries: ReadonlyArray<TEntry | null>, centerIndex: number) => Array<FeedRingSlotAssignment<TEntry>>;
//# sourceMappingURL=feedRingWindow.d.ts.map