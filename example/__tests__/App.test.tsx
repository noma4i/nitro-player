/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-safe-area-context', () => {
  const ReactRuntime = require('react');
  const { View: NativeView } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactRuntime.createElement(NativeView, null, children),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactRuntime.createElement(NativeView, null, children)
  };
});

jest.mock('@noma4i/nitro-play', () => {
  const ReactRuntime = require('react');
  const { View: NativeView } = require('react-native');
  const Surface = ReactRuntime.forwardRef((props: { testID?: string }, ref: React.Ref<unknown>) => {
    ReactRuntime.useImperativeHandle(ref, () => ({ seekTo: jest.fn(), replay: jest.fn() }));
    return ReactRuntime.createElement(NativeView, { testID: 'mock-surface', ...props });
  });
  return {
    NITRO_PLAYBACK_CONTEXTS: { hero: { group: 'hero', priority: 400, resume: 'manual' } },
    NitroPlaybackBoundary: ({ children }: { children: React.ReactNode }) => children,
    NitroPlaybackSurface: Surface,
    NitroFeedRingSlotView: () => null,
    resolveFeedRingSlotId: (index: number) => ((index % 3) + 3) % 3,
    useNitroFeedRingHost: () => ({ binding: null, isActive: false, publishViewport: jest.fn(), readSnapshot: () => null }),
    clearNitroPlaybackCache: jest.fn(() => Promise.resolve()),
    getNitroPlaybackCacheStats: jest.fn(() => Promise.resolve({ totalBytes: 0, fileCount: 0, maxBytes: 1 })),
    prefetchNitroPlaybackSource: jest.fn()
  };
});

const flatten = (node: ReactTestRenderer.ReactTestRendererJSON | ReactTestRenderer.ReactTestRendererJSON[] | null): string => JSON.stringify(node);

describe('App', () => {
  it('shows the surface screen first and switches to the feed ring screen', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });

    expect(flatten(renderer.toJSON())).toContain('screen-surface');

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'tab-ring' }).props.onPress();
    });

    expect(flatten(renderer.toJSON())).toContain('screen-ring');
    expect(flatten(renderer.toJSON())).not.toContain('screen-surface');
  });
});
