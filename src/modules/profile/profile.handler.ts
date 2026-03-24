import { Injectable } from "../../core";
import { ISocketHandler, TSocket } from "../socket";

@Injectable()
export class ProfileHandler implements ISocketHandler {
  constructor() {}

  onConnection(socket: TSocket): void {
    socket.on("profile:subscribe", () => {
      socket.join("profile");
    });
  }
}
