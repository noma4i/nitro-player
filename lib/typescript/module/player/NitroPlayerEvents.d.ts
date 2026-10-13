import type { ListenerSubscription, NitroPlayerEventEmitter } from '../bridge/nitro/NitroPlayerEventEmitter.nitro.js';
import type { AllNitroPlayerEvents as PlayerEvents } from './events.js';
export declare abstract class NitroPlayerEvents {
    protected abstract get eventEmitter(): NitroPlayerEventEmitter;
    addEventListener<Event extends keyof PlayerEvents>(event: Event, callback: PlayerEvents[Event]): ListenerSubscription;
}
//# sourceMappingURL=NitroPlayerEvents.d.ts.map