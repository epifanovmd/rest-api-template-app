import { inject } from "inversify";

import { Injectable } from "../../core";
import { ISocketEmitEvents } from "./socket.types";
import { SocketClientRegistry } from "./socket-client-registry";
import { SocketServerService } from "./socket-server.service";

@Injectable()
export class SocketEmitterService {
  constructor(
    @inject(SocketServerService) private readonly server: SocketServerService,
    @inject(SocketClientRegistry)
    private readonly registry: SocketClientRegistry,
  ) {}

  toUser<K extends keyof ISocketEmitEvents>(
    userId: string,
    event: K,
    ...args: Parameters<ISocketEmitEvents[K]>
  ): boolean {
    const socket = this.registry.getSocket(userId);

    if (!socket) return false;

    socket.emit<any>(event, ...args);

    return true;
  }

  toRoom<K extends keyof ISocketEmitEvents>(
    room: string,
    event: K,
    ...args: Parameters<ISocketEmitEvents[K]>
  ): void {
    this.server.io.to(room).emit<any>(event, ...args);
  }

  broadcast<K extends keyof ISocketEmitEvents>(
    event: K,
    ...args: Parameters<ISocketEmitEvents[K]>
  ): void {
    this.server.io.emit<any>(event, ...args);
  }
}
