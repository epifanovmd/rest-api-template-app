import { inject } from "inversify";

import { Injectable } from "../../core";
import { ISocketEmitEvents } from "./socket.types";
import { SocketServerService } from "./socket-server.service";

@Injectable()
export class SocketEmitterService {
  constructor(
    @inject(SocketServerService) private readonly server: SocketServerService,
  ) {}

  /**
   * Отправляет событие конкретному пользователю.
   * Работает для всех активных соединений пользователя (несколько вкладок/устройств)
   * через Socket.IO room 'user_${userId}', в которую автоматически вступает каждый сокет.
   */
  toUser<K extends keyof ISocketEmitEvents>(
    userId: string,
    event: K,
    ...args: Parameters<ISocketEmitEvents[K]>
  ): void {
    this.server.io.to(`user_${userId}`).emit<any>(event, ...args);
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
