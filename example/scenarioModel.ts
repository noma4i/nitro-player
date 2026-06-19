import type { NitroSourceConfig, StreamHeaders } from '@noma4i/nitro-play';

export const HLS_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
export const MP4_URL = 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4';

export type StreamRuntimeSource = {
  uri: string;
  headers?: StreamHeaders;
};

export const toStreamRuntimeSource = (source: NitroSourceConfig): StreamRuntimeSource | null => {
  if (typeof source.uri !== 'string') {
    return null;
  }

  return { uri: source.uri, headers: source.headers };
};

export const isHlsManifestSource = (source: NitroSourceConfig): source is NitroSourceConfig & StreamRuntimeSource => {
  if (typeof source.uri !== 'string') {
    return false;
  }

  return source.uri.split('?')[0]?.toLowerCase().endsWith('.m3u8') === true;
};

export const HERO_SOURCES = {
  startupProxy: {
    key: 'startupProxy',
    label: 'Feed HLS Stream',
    chip: 'Proxy Route',
    note: 'Lazy HLS startup with automatic proxy routing. This is the stream-cache and playback recovery scenario.',
    source: {
      uri: HLS_URL,
      startup: 'lazy',
      metadata: {
        title: 'Feed stream',
        subtitle: 'Auto proxy',
      },
      transport: { mode: 'auto' },
      retention: {
        preload: 'metadata',
        offscreen: 'metadata',
        trimDelayMs: 4000,
        feedPoolEligible: true,
      },
      preview: {
        mode: 'always',
        maxWidth: 640,
        maxHeight: 360,
        quality: 80,
      },
    } satisfies NitroSourceConfig,
  },
  profileStream: {
    key: 'profileStream',
    label: 'Profile HLS Stream',
    chip: 'Header Scope',
    note: 'Same HLS URL with harmless scenario headers. Cache identity should stay scoped without breaking playback.',
    source: {
      uri: HLS_URL,
      headers: {
        'X-Nitro-Scenario': 'profile-feed',
      },
      startup: 'lazy',
      metadata: {
        title: 'Profile stream',
        subtitle: 'Scoped headers',
      },
      transport: { mode: 'auto' },
      retention: {
        preload: 'metadata',
        offscreen: 'metadata',
        trimDelayMs: 4000,
        feedPoolEligible: true,
      },
      preview: {
        mode: 'listener',
        maxWidth: 512,
        maxHeight: 512,
        quality: 72,
      },
    } satisfies NitroSourceConfig,
  },
  directMp4: {
    key: 'directMp4',
    label: 'Direct MP4 Preview',
    chip: 'Preview Path',
    note: 'Direct transport with explicit preview generation. This is the reliable emulator thumbnail scenario.',
    source: {
      uri: MP4_URL,
      startup: 'eager',
      metadata: {
        title: 'Direct clip',
        subtitle: 'Generated preview',
      },
      transport: { mode: 'direct' },
      retention: {
        preload: 'buffered',
        offscreen: 'hot',
        trimDelayMs: 12000,
        feedPoolEligible: false,
      },
      preview: {
        mode: 'manual',
        maxWidth: 480,
        maxHeight: 270,
        quality: 70,
      },
    } satisfies NitroSourceConfig,
  },
} as const;

export const FEED_SOURCES = [
  {
    key: 'feed-home',
    title: 'Home Feed Stream',
    tone: '#ec5f67',
    source: HERO_SOURCES.profileStream.source,
    description: 'Header-scoped HLS in listener mode, matching a home feed cell.',
  },
  {
    key: 'feed-creator',
    title: 'Creator Feed Stream',
    tone: '#4cb3ff',
    source: {
      ...HERO_SOURCES.profileStream.source,
      headers: {
        'X-Nitro-Scenario': 'creator-feed',
      },
      metadata: {
        title: 'Creator stream',
        subtitle: 'Parallel feed cell',
      },
      preview: {
        mode: 'always',
        maxWidth: 512,
        maxHeight: 512,
        quality: 76,
      },
    } satisfies NitroSourceConfig,
    description: 'Same playable HLS URL with a different harmless header identity.',
  },
  {
    key: 'feed-direct',
    title: 'Inline MP4 Preview',
    tone: '#66d19e',
    source: HERO_SOURCES.directMp4.source,
    description: 'Direct MP4 alongside streaming cards to check mixed transport and preview coexistence.',
  },
] as const;

export const CONSUMER_PAGE_SIZE = 3;
export const CONSUMER_PREFETCH_WINDOW = 1;

export type ConsumerFeedItem = {
  key: string;
  title: string;
  page: number;
  reuseGroup: string;
  source: NitroSourceConfig;
  note: string;
};

export const CONSUMER_FEED_ITEMS: ConsumerFeedItem[] = [
  {
    key: 'page-1-home-active',
    title: 'Page 1 Home Stream',
    page: 1,
    reuseGroup: 'home-stream-object',
    source: HERO_SOURCES.profileStream.source,
    note: 'Same object as the profile/home stream. Verifies value-based reuse across surfaces.',
  },
  {
    key: 'page-1-creator-header',
    title: 'Page 1 Creator Stream',
    page: 1,
    reuseGroup: 'creator-stream-header',
    source: FEED_SOURCES[1].source,
    note: 'Same HLS URL, different harmless header. Cache identity must stay isolated.',
  },
  {
    key: 'page-1-direct',
    title: 'Page 1 MP4 Preview',
    page: 1,
    reuseGroup: 'direct-mp4',
    source: HERO_SOURCES.directMp4.source,
    note: 'Direct MP4 in the same pool as proxied HLS cards.',
  },
  {
    key: 'page-2-home-copy',
    title: 'Page 2 Home Reuse',
    page: 2,
    reuseGroup: 'home-stream-object',
    source: HERO_SOURCES.profileStream.source,
    note: 'Reuses the exact home stream object after page append.',
  },
  {
    key: 'page-2-topic-header',
    title: 'Page 2 Topic Stream',
    page: 2,
    reuseGroup: 'topic-stream-header',
    source: {
      ...HERO_SOURCES.profileStream.source,
      headers: {
        'X-Nitro-Scenario': 'topic-feed',
      },
      metadata: {
        title: 'Topic stream',
        subtitle: 'Page 2 variant',
      },
      retention: {
        preload: 'metadata',
        offscreen: 'metadata',
        trimDelayMs: 6000,
        feedPoolEligible: true,
      },
    } satisfies NitroSourceConfig,
    note: 'Header identity churn while keeping the playable URL stable.',
  },
  {
    key: 'page-2-startup-proxy',
    title: 'Page 2 Proxy Startup',
    page: 2,
    reuseGroup: 'startup-proxy',
    source: HERO_SOURCES.startupProxy.source,
    note: 'Lazy HLS startup source mounted after pagination.',
  },
  {
    key: 'page-3-direct-reuse',
    title: 'Page 3 MP4 Reuse',
    page: 3,
    reuseGroup: 'direct-mp4',
    source: HERO_SOURCES.directMp4.source,
    note: 'Direct MP4 source reused after multiple active-index changes.',
  },
  {
    key: 'page-3-home-new-metadata',
    title: 'Page 3 Home Metadata',
    page: 3,
    reuseGroup: 'home-stream-metadata',
    source: {
      ...HERO_SOURCES.profileStream.source,
      metadata: {
        title: 'Home stream',
        subtitle: 'Metadata identity variant',
      },
    } satisfies NitroSourceConfig,
    note: 'Same URL/header with metadata changed to stress source signature.',
  },
  {
    key: 'page-3-notification-header',
    title: 'Page 3 Notification Stream',
    page: 3,
    reuseGroup: 'notification-stream-header',
    source: {
      ...HERO_SOURCES.profileStream.source,
      headers: {
        'X-Nitro-Scenario': 'notification-feed',
      },
      metadata: {
        title: 'Notification stream',
        subtitle: 'Page 3 variant',
      },
      preview: {
        mode: 'listener',
        maxWidth: 320,
        maxHeight: 320,
        quality: 68,
      },
    } satisfies NitroSourceConfig,
    note: 'Late-page header variant with smaller preview target.',
  },
];

export const getVisibleConsumerItems = (pageIndex: number): ConsumerFeedItem[] => CONSUMER_FEED_ITEMS.slice(0, (pageIndex + 1) * CONSUMER_PAGE_SIZE);

export const getActiveWindow = (visibleItems: ConsumerFeedItem[], activeIndex: number, radius = CONSUMER_PREFETCH_WINDOW): ConsumerFeedItem[] => {
  return visibleItems.filter((_, index) => Math.abs(index - activeIndex) <= radius);
};

export const buildConsumerCardSource = (item: ConsumerFeedItem, index: number, isActive: boolean): NitroSourceConfig => {
  const distanceRetention = isActive
    ? { preload: 'buffered' as const, offscreen: 'hot' as const, trimDelayMs: 12000, feedPoolEligible: true }
    : { preload: 'metadata' as const, offscreen: 'metadata' as const, trimDelayMs: 5000, feedPoolEligible: true };

  return {
    ...item.source,
    startup: isActive ? 'eager' : 'lazy',
    retention: {
      ...distanceRetention,
      ...(item.source.retention ?? {}),
    },
    transport: {
      mode: item.source.transport?.mode ?? 'auto',
      ...(item.source.transport ?? {}),
    },
    preview: {
      mode: isActive ? 'always' : 'listener',
      maxWidth: 512,
      maxHeight: 512,
      quality: 72,
      ...(item.source.preview ?? {}),
    },
    metadata: {
      ...(item.source.metadata ?? {}),
      title: item.title,
      subtitle: `page ${item.page}, row ${index + 1}`,
    },
  };
};
