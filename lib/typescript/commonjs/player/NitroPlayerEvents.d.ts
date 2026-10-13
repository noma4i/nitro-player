import type { ListenerSubscription, NitroPlayerEventEmitter } from '../bridge/nitro/NitroPlayerEventEmitter.nitro';
import type { AllNitroPlayerEvents as PlayerEvents } from './events';
export declare abstract class NitroPlayerEvents {
    protected abstract get eventEmitter(): NitroPlayerEventEmitter;
    addEventListener<Event extends keyof PlayerEvents>(event: Event, callback: PlayerEvents[Event]): ListenerSubscription;
}
//# sourceMappingURL=NitroPlayerEvents.d.ts.map