import type { NitroPlayerSource } from '../bridge/nitro/NitroPlayerSource.nitro';
import type { NitroSourceConfig } from './types/NitroPlayerConfig';
export declare const isNitroPlayerSource: (obj: unknown) => obj is NitroPlayerSource;
export declare const createNitroSource: (source: NitroSourceConfig | NitroPlayerSource) => NitroPlayerSource;
//# sourceMappingURL=sourceFactory.d.ts.map