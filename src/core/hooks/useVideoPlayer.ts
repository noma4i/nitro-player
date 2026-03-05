import { useEffect, useRef } from 'react';
import type { VideoPlayerSource } from '../../spec/nitro/VideoPlayerSource.nitro';
import type { NoAutocomplete } from '../types/Utils';
import type { MemoryProfile } from '../types/MemoryConfig';
import type { VideoConfig, VideoSource } from '../types/VideoConfig';
import { VideoPlayer } from '../VideoPlayer';
import { useManagedInstance } from './useManagedInstance';
import { getSourceIdentityKey } from '../utils/sourceFactory';

/**
 * Creates a `VideoPlayer` instance and manages its lifecycle.
 *
 * if `initializeOnCreation` is true (default), the `setup` function will be called when the player is started loading source.
 * if `initializeOnCreation` is false, the `setup` function will be called when the player is created. changes made to player made before initializing will be overwritten when initializing.
 *
 * @param source - The source of the video to play
 * @param setup - A function to setup the player
 * @returns The `VideoPlayer` instance
 */
export const useVideoPlayer = (
  source: VideoConfig | VideoSource | NoAutocomplete<VideoPlayerSource>,
  setup?: (player: VideoPlayer) => void,
  options: {
    defaultMemoryProfile?: MemoryProfile;
  } = {}
) => {
  const { defaultMemoryProfile } = options;
  const player = useManagedInstance(
    {
      factory: () => {
        return new VideoPlayer(source, { defaultMemoryProfile });
      },
      cleanup: player => {
        player.__destroy();
      }
    },
    [getSourceIdentityKey(source), defaultMemoryProfile]
  );

  const appliedSetupRef = useRef<{
    player: VideoPlayer | null;
    setup?: ((player: VideoPlayer) => void) | undefined;
  }>({
    player: null,
    setup: undefined
  });

  useEffect(() => {
    if (setup === undefined) {
      appliedSetupRef.current = { player, setup: undefined };
      return;
    }

    const hasAppliedCurrentSetup = appliedSetupRef.current.player === player && appliedSetupRef.current.setup === setup;

    const applySetup = () => {
      if (appliedSetupRef.current.player === player && appliedSetupRef.current.setup === setup) {
        return;
      }

      setup(player);
      appliedSetupRef.current = { player, setup };
    };

    if (player.source.config.initializeOnCreation === false) {
      applySetup();
      return;
    }

    if (
      hasAppliedCurrentSetup ||
      player.playbackState.status === 'loading' ||
      player.playbackState.status === 'buffering' ||
      player.playbackState.status === 'playing' ||
      player.playbackState.status === 'paused' ||
      player.playbackState.status === 'ended' ||
      player.status === 'error'
    ) {
      applySetup();
      return;
    }

    const loadStartSubscription = player.addEventListener('onLoadStart', applySetup);
    const playbackStateSubscription = player.addEventListener('onPlaybackState', applySetup);

    return () => {
      loadStartSubscription.remove();
      playbackStateSubscription.remove();
    };
  }, [player, setup]);

  return player;
};
