import type { PropsWithChildren, ReactNode } from 'react';
export type NitroPlaybackBoundaryProps = PropsWithChildren<Readonly<{
    suspended: boolean;
    allowGroups?: readonly string[];
}>>;
export declare function NitroPlaybackBoundary({ children, suspended, allowGroups }: NitroPlaybackBoundaryProps): ReactNode;
//# sourceMappingURL=NitroPlaybackBoundary.d.ts.map