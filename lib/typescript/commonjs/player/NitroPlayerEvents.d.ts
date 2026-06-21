import type { ListenerSubscription, NitroPlayerEventEmitter } from '../bridge/nitro/NitroPlayerEventEmitter.nitro';
import { type AllNitroPlayerEvents as PlayerEvents } from './events';
export declare class NitroPlayerEvents {
    protected eventEmitter: NitroPlayerEventEmitter;
    protected readonly supportedEvents: (keyof PlayerEvents)[];
    constructor(eventEmitter: NitroPlayerEventEmitter);
    addEventListener<Event extends keyof PlayerEvents>(event: Event, callback: PlayerEvents[Event]): ListenerSubscription;
    clearAllEvents(): void;
}
//# sourceMappingURL=NitroPlayerEvents.d.ts.map