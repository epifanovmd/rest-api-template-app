import { inject, injectable } from "inversify";
import Koa from "koa";

import { iocContainer } from "../app.container";
import { IBootstrap } from "../core";
import { SocketService } from "../modules/socket";
import { SocketGateway } from "../modules/socket/socket.gateway";

@injectable()
export class SocketBootstrap implements IBootstrap {
  constructor(@inject(Koa) private readonly koa: Koa) {}

  async initialize(): Promise<void> {
    SocketService.setup(iocContainer, this.koa);
    iocContainer.get<SocketGateway>(SocketGateway).initialize();
  }
}
