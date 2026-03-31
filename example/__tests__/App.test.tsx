/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, View } from 'react-native';
import App from '../App';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('@noma4i/nitro-play', () => {
  const React = require('react');
  const { Text, View } = require('react-native');

  const mockPlayer = {
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    seekBy: jest.fn(),
    preload: jest.fn(() => Promise.resolve()),
    initialize: jest.fn(() => Promise.resolve()),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  };

  const NitroPlayerView = React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({
      player: mockPlayer,
      isAttached: true,
      enterFullscreen: jest.fn(),
      exitFullscreen: jest.fn(),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    }));

    return (
      <View>
        <Text>NitroPlayerView Mock</Text>
      </View>
    );
  });

  return {
    NitroPlayerView,
    streamCache: {
      prefetch: jest.fn(() => Promise.resolve()),
      getStats: jest.fn(() =>
        Promise.resolve({
          totalSize: 0,
          fileCount: 0,
          maxSize: 5_368_709_120,
          streamSize: 0,
          streamFileCount: 0,
        })
      ),
      clear: jest.fn(() => Promise.resolve(true)),
    },
    videoPreview: {
      getFirstFrame: jest.fn(() => Promise.resolve(null)),
      clear: jest.fn(() => Promise.resolve(true)),
    },
    usePlaybackState: jest.fn(() => ({
      status: 'idle',
      currentTime: 0,
      duration: 0,
      bufferDuration: 0,
      bufferedPosition: 0,
      isVisualReady: false,
    })),
    useEvent: jest.fn(),
  };
});

test('renders example lab', async () => {
  let root: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    root = ReactTestRenderer.create(<App />);
  });

  const text = JSON.stringify(root!.toJSON());
  expect(text).toContain('NitroPlay Example Lab');
  expect(text).toContain('Hero Playback');
  expect(text).toContain('Feed Stress');
  expect(text).toContain('Runtime Utilities');
});
