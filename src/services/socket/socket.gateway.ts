import { inject, injectable } from "inversify";

import { SocketService } from "./socket.service";

@injectable()
export class SocketGateway {
  private subscribes = new Map<string, NodeJS.Timeout>();

  constructor(@inject(SocketService) private _socketService: SocketService) {}

  start = () => {
    this._socketService.onConnection((_client, _clientSocket) => {
      // some subscribes for new connection client
    });
  };
}
