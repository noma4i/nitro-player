import * as React from 'react';
import { act, render } from '@testing-library/react';
import type { NitroPlayer } from '../../NitroPlayer';
import type { PlaybackState } from '../../types/PlaybackState';
import { NitroPlayerRuntimeError } from '../../../support/errors/NitroPlayerError';
import { usePlaybackState } from '../usePlaybackState';

type PlaybackStateListener = (state: PlaybackState) => void;

const createPlaybackState = (overrides?: Partial<PlaybackState>): PlaybackState => ({
  status: 'playing',
  currentTime: 0,
  duration: 100,
  bufferDuration: 10,
  bufferedPosition: 10,
  rate: 1,
  isPlaying: true,
  isBuffering: false,
  isVisualReady: true,
  nativeTimestampMs: 1,
  ...overrides
});

const createPlayer = (initialState: PlaybackState) => {
  let currentState = initialState;
  let listener: PlaybackStateListener | null = null;
  const remove = jest.fn(() => {
    listener = null;
  });
  const addEventListener = jest.fn((_event: 'onPlaybackState', nextListener: PlaybackStateListener) => {
    listener = nextListener;
    return { remove };
  });
  const player = {
    get playbackState() {
      return currentState;
    },
    addEventListener
  } as unknown as NitroPlayer;

  return {
    addEventListener,
    emit(nextState: PlaybackState) {
      currentState = nextState;
      listener?.(nextState);
    },
    player,
    remove
  };
};

const createReleasedPlayer = () => {
  const addEventListener = jest.fn();
  const player = {
    get playbackState() {
      throw new NitroPlayerRuntimeError('player/released', 'Player is released');
    },
    addEventListener
  } as unknown as NitroPlayer;

  return { addEventListener, player };
};

const FullStateProbe = ({ onRender, player }: { onRender: (state: PlaybackState | null) => void; player: NitroPlayer | null }) => {
  onRender(usePlaybackState(player));
  return null;
};

const StatusProbe = ({ onRender, player }: { onRender: (status: PlaybackState['status'] | null) => void; player: NitroPlayer | null }) => {
  onRender(usePlaybackState(player, state => state.status));
  return null;
};

const SummaryProbe = ({
  onRender,
  player
}: {
  onRender: (summary: { status: PlaybackState['status']; isPlaying: boolean } | null) => void;
  player: NitroPlayer | null;
}) => {
  onRender(
    usePlaybackState(player, state => ({
      status: state.status,
      isPlaying: state.isPlaying
    }))
  );
  return null;
};

const ErrorProbe = ({ onRender, player }: { onRender: (error: PlaybackState['error'] | null) => void; player: NitroPlayer | null }) => {
  onRender(usePlaybackState(player, state => state.error));
  return null;
};

describe('usePlaybackState', () => {
  it('does not re-render a status selector when only currentTime changes', async () => {
    const mock = createPlayer(createPlaybackState());
    const onRender = jest.fn();
    const view = render(
      <StatusProbe
        player={mock.player}
        onRender={onRender}
      />
    );
    await act(async () => undefined);

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(mock.addEventListener).toHaveBeenCalledTimes(1);

    view.rerender(
      <StatusProbe
        player={mock.player}
        onRender={onRender}
      />
    );
    await act(async () => undefined);
    expect(mock.addEventListener).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenCalledTimes(2);

    act(() => {
      mock.emit(createPlaybackState({ currentTime: 1, nativeTimestampMs: 2 }));
    });
    expect(onRender).toHaveBeenCalledTimes(2);

    act(() => {
      mock.emit(createPlaybackState({ currentTime: 2, isPlaying: false, status: 'paused', nativeTimestampMs: 3 }));
    });
    expect(onRender).toHaveBeenCalledTimes(3);
    expect(onRender).toHaveBeenLastCalledWith('paused');
  });

  it('shallow-compares object selector results', async () => {
    const mock = createPlayer(createPlaybackState());
    const onRender = jest.fn();
    render(
      <SummaryProbe
        player={mock.player}
        onRender={onRender}
      />
    );
    await act(async () => undefined);

    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      mock.emit(createPlaybackState({ currentTime: 1, nativeTimestampMs: 2 }));
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      mock.emit(createPlaybackState({ currentTime: 2, isPlaying: false, status: 'paused', nativeTimestampMs: 3 }));
    });
    expect(onRender).toHaveBeenCalledTimes(2);
    expect(onRender).toHaveBeenLastCalledWith({ status: 'paused', isPlaying: false });
  });

  it('keeps full-state form updating for new playback state objects', async () => {
    const mock = createPlayer(createPlaybackState());
    const onRender = jest.fn();
    render(
      <FullStateProbe
        player={mock.player}
        onRender={onRender}
      />
    );
    await act(async () => undefined);

    expect(onRender).toHaveBeenCalledTimes(1);

    const nextState = createPlaybackState({ currentTime: 1, nativeTimestampMs: 2 });
    act(() => {
      mock.emit(nextState);
    });

    expect(onRender).toHaveBeenCalledTimes(2);
    expect(onRender).toHaveBeenLastCalledWith(nextState);
  });

  it('subscribes when selector initially returns null and updates when value appears', async () => {
    const mock = createPlayer(createPlaybackState({ error: null }));
    const onRender = jest.fn();
    const playbackError = { code: 'player/not-initialized' as const, message: 'Not initialized' };
    render(
      <ErrorProbe
        player={mock.player}
        onRender={onRender}
      />
    );
    await act(async () => undefined);

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenCalledWith(null);
    expect(mock.addEventListener).toHaveBeenCalledTimes(1);

    act(() => {
      mock.emit(createPlaybackState({ error: playbackError, status: 'error', nativeTimestampMs: 2 }));
    });

    expect(onRender).toHaveBeenCalledTimes(2);
    expect(onRender).toHaveBeenLastCalledWith(playbackError);
  });

  it('returns null and skips subscription for released players', async () => {
    const mock = createReleasedPlayer();
    const onRender = jest.fn();
    render(
      <FullStateProbe
        player={mock.player}
        onRender={onRender}
      />
    );
    await act(async () => undefined);

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenCalledWith(null);
    expect(mock.addEventListener).not.toHaveBeenCalled();
  });
});
