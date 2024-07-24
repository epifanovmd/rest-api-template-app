import { Container } from "inversify";

import { Module } from "../../modules";
import { SocketGateway } from "./socket.gateway";
import { SocketService } from "./socket.service";

export class SocketModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(SocketGateway).to(SocketGateway).inSingletonScope();
    ioc.bind(SocketService).to(SocketService).inSingletonScope();
  }
}
