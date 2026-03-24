import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { ProfileUpdatedEvent } from "./events";

@Injectable()
export class ProfileListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly emitter: SocketEmitterService,
  ) {}

  register(): void {
    this.eventBus.on(ProfileUpdatedEvent, (event: ProfileUpdatedEvent) => {
      this.emitter.toRoom("profile", "profile:updated", event.profile);
    });
  }
}
