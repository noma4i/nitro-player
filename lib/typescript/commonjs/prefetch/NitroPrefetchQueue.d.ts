import type { NitroSourceInput } from '../source/types/NitroPlayerConfig';
export interface NitroPrefetchRequest {
    key: string;
    source: NitroSourceInput;
    durationSeconds?: number;
    priority: number;
}
export interface NitroPrefetchQueue {
    setWindow(requests: readonly NitroPrefetchRequest[]): void;
    clear(): void;
    dispose(): void;
    readSnapshot(): object;
}
export declare const createNitroPrefetchQueue: (options?: {
    maxConcurrent?: number;
    ttlMs?: number;
}) => NitroPrefetchQueue;
//# sourceMappingURL=NitroPrefetchQueue.d.ts.map