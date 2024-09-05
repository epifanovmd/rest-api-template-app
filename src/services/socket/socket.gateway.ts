import { inject, injectable as Injectable } from "inversify";

import { SocketService } from "./socket.service";

const socketService = new SocketService();

// @injectable()
export class SocketGateway {
  private subscribes = new Map<string, NodeJS.Timeout>();

  start = () => {
    socketService.onConnection((_client, _clientSocket) => {
      // some subscribes for new connection client
    });
  };
}
