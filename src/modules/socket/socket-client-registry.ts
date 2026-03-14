import { Injectable } from "../../core";
import { TSocket } from "./socket.types";

/**
 * Реестр активных socket-соединений.
 * Поддерживает несколько соединений на одного пользователя (несколько вкладок/устройств).
 *
 * НЕ используется для доставки сообщений — для этого есть Socket.IO rooms ('user_${userId}').
 * Используется исключительно для проверки присутствия (isOnline).
 */
@Injectable()
export class SocketClientRegistry {
  private readonly clients = new Map<string, Set<TSocket>>();

  register(userId: string, socket: TSocket): void {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }

    this.clients.get(userId)!.add(socket);
  }

  unregister(userId: string, socket: TSocket): void {
    const sockets = this.clients.get(userId);

    if (!sockets) return;

    sockets.delete(socket);

    if (sockets.size === 0) {
      this.clients.delete(userId);
    }
  }

  isOnline(userId: string): boolean {
    const sockets = this.clients.get(userId);

    return !!sockets && sockets.size > 0;
  }
}
