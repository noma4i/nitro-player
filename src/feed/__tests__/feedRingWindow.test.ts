import { feedRingWindowIndices, resolveFeedRingSlotAssignments, resolveFeedRingSlotId } from '../feedRingWindow';

describe('feedRingWindow', () => {
  it('computes a three-slot window with native modulo parity', () => {
    const entries = ['previous', 'current', 'next'];

    const assignments = resolveFeedRingSlotAssignments(entries, 0);

    expect(feedRingWindowIndices(0)).toEqual([-1, 0, 1]);
    expect(assignments.map(assignment => assignment.slotId)).toEqual([2, 0, 1]);
    expect(assignments.map(assignment => assignment.assignedIndex)).toEqual([-1, 0, 1]);
    expect(assignments.map(assignment => assignment.entry)).toEqual([null, 'previous', 'current']);
    expect(resolveFeedRingSlotId(-4)).toBe(2);
  });

  it('keeps null holes while preserving slot assignment order', () => {
    const assignments = resolveFeedRingSlotAssignments(['zero', null, 'two', 'three'], 2);

    expect(assignments).toEqual([
      { slotId: 1, assignedIndex: 1, entry: null },
      { slotId: 2, assignedIndex: 2, entry: 'two' },
      { slotId: 0, assignedIndex: 3, entry: 'three' }
    ]);
  });
});
