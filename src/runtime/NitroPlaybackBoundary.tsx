import { createElement, Fragment, useLayoutEffect } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { suspendNitroPlayback } from './nativePlaybackRuntime';

export type NitroPlaybackBoundaryProps = PropsWithChildren<Readonly<{
  suspended: boolean;
  allowGroups?: readonly string[];
}>>;

export function NitroPlaybackBoundary({ children, suspended, allowGroups }: NitroPlaybackBoundaryProps): ReactNode {
  useLayoutEffect(() => {
    if (!suspended) {
      return;
    }

    const handle = suspendNitroPlayback('boundary', allowGroups);

    return () => {
      handle.release();
    };
  }, [suspended, allowGroups]);

  return createElement(Fragment, null, children);
}
