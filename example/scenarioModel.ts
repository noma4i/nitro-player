import type { NitroFeedRingCatalogItem, NitroSourceConfig } from '@noma4i/nitro-play';

export const HLS_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
export const MP4_URL = 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4';
export const LONG_HLS_URL = 'https://test-streams.mux.dev/pts_shift/master.m3u8';

export type ExampleScreenKey = 'surface' | 'ring';

export const EXAMPLE_SCREENS = [
  { key: 'surface', label: 'Surface', headline: 'One NitroPlaybackSurface with runtime controls' },
  { key: 'ring', label: 'Feed ring', headline: 'Three native slots shared by a scrolling list' }
] as const satisfies readonly { key: ExampleScreenKey; label: string; headline: string }[];

export type SurfaceSourceEntry = Readonly<{ key: string; title: string; source: NitroSourceConfig }>;

export const SURFACE_SOURCES: readonly SurfaceSourceEntry[] = [
  { key: 'hls', title: 'HLS stream', source: { uri: HLS_URL } },
  { key: 'mp4', title: 'Progressive MP4', source: { uri: MP4_URL } },
  { key: 'long-hls', title: 'Long HLS stream', source: { uri: LONG_HLS_URL } }
];

export const RING_ITEM_COUNT = 12;

export const buildRingCatalogItems = (count: number = RING_ITEM_COUNT): NitroFeedRingCatalogItem[] =>
  Array.from({ length: count }, (_, index) => {
    const entry = SURFACE_SOURCES[index % SURFACE_SOURCES.length];
    return {
      index,
      itemId: `ring-${index}`,
      source: { ...entry.source, headers: { 'X-Nitro-Item': String(index) } }
    };
  });

export const formatSeconds = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) {
    return '--:--';
  }
  const totalSeconds = Math.floor(value);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

export const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};
