import { buildRingCatalogItems, formatBytes, formatSeconds, RING_ITEM_COUNT } from '../scenarioModel';

describe('scenarioModel', () => {
  it('builds a contiguous ring catalog with a distinct header per item', () => {
    const items = buildRingCatalogItems();

    expect(items).toHaveLength(RING_ITEM_COUNT);
    expect(items.map(item => item.index)).toEqual(Array.from({ length: RING_ITEM_COUNT }, (_, index) => index));
    expect(new Set(items.map(item => (item.source as { headers: Record<string, string> }).headers['X-Nitro-Item'])).size).toBe(RING_ITEM_COUNT);
  });

  it('formats time and bytes for the metrics panel', () => {
    expect(formatSeconds(75)).toBe('01:15');
    expect(formatSeconds(Number.NaN)).toBe('--:--');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(0)).toBe('0 B');
  });
});
