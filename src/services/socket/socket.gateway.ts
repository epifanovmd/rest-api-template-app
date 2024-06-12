import { inject, injectable as Injectable } from "inversify";
import { SocketService } from "./socket.service";

@Injectable()
export class SocketGateway {
  private subscribes = new Map<string, NodeJS.Timeout>();

  constructor(@inject(SocketService) private _socketService: SocketService) {}

  start = () => {
    this._socketService.onConnection((client, clientSocket) => {
      // some subscribes for new connection client
    });
  };
}
