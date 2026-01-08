import { inject } from "inversify";

import { Injectable } from "../../core";
import { DialogSocketGateway } from "../dialog/dialog-socket.gateway";
import { SocketService } from "./socket.service";

@Injectable()
export class SocketGateway {
  constructor(
    @inject(SocketService) private socketService: SocketService,
    @inject(DialogSocketGateway)
    private _dialogSocketGateway: DialogSocketGateway,
  ) {}

  public initialize(): void {
    this._dialogSocketGateway.initialize();
    this.socketService.io.on("connection", socket => {
      const user = socket.data; // Пользователь из middleware

      console.info(`Socket gateway initialized for user ${user?.id}`);
    });
  }
}
