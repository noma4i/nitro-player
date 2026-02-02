import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const addEventListener = jest.fn(
  (_event: string, callback: () => void) => ({
    remove: jest.fn(() => callback),
  })
);

const destroy = jest.fn();

const playerInstance = {
  source: {
    config: {
      initializeOnCreation: false,
    },
  },
  status: 'idle',
  addEventListener,
  __destroy: destroy,
};

jest.mock('../core/hooks/useManagedInstance', () => ({
  useManagedInstance: jest.fn(() => playerInstance),
}));

describe('useVideoPlayer', () => {
  beforeEach(() => {
    addEventListener.mockClear();
    destroy.mockClear();
  });

  it('re-applies setup when callback changes without recreating player', () => {
    const firstSetup = jest.fn();
    const secondSetup = jest.fn();
    const { useVideoPlayer } = require('../core/hooks/useVideoPlayer');

    function TestComponent({
      setup,
    }: {
      setup: (player: typeof playerInstance) => void;
    }) {
      useVideoPlayer({ uri: 'https://cdn.example.com/video.mp4' }, setup);
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<TestComponent setup={firstSetup} />);
    });

    expect(firstSetup).toHaveBeenCalledWith(playerInstance);

    act(() => {
      renderer!.update(<TestComponent setup={secondSetup} />);
    });

    expect(secondSetup).toHaveBeenCalledWith(playerInstance);
    expect(firstSetup).toHaveBeenCalledTimes(1);
  });
});
