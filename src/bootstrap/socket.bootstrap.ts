import { inject, injectable } from "inversify";

import { IBootstrap } from "../core";
import { DialogSocketEventHandler } from "../modules/dialog/dialog-socket-event.handler";
import { SocketGateway } from "../modules/socket/socket.gateway";

@injectable()
export class SocketBootstrap implements IBootstrap {
  constructor(
    @inject(SocketGateway) private readonly socketGateway: SocketGateway,
    @inject(DialogSocketEventHandler)
    private readonly eventHandler: DialogSocketEventHandler,
  ) {}

  async initialize(): Promise<void> {
    this.socketGateway.initialize();
    this.eventHandler.register();
  }
}
