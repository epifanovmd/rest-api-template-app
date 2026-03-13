import { Injectable } from "../../core";
import { TSocket } from "./socket.types";

@Injectable()
export class SocketClientRegistry {
  private readonly clients = new Map<string, TSocket>();

  register(userId: string, socket: TSocket): void {
    this.clients.set(userId, socket);
  }

  unregister(userId: string): void {
    this.clients.delete(userId);
  }

  getSocket(userId: string): TSocket | undefined {
    return this.clients.get(userId);
  }

  isOnline(userId: string): boolean {
    return this.clients.has(userId);
  }
}
