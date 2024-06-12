import { parse } from "cookie";
import { createServer } from "http";
import { injectable as Injectable } from "inversify";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { app } from "../../app";
import { jwtSecretKey } from "../../common";
import { ProfileDto } from "../auth";
import { Socket, SocketEmitEvents, SocketEvents } from "./socket.types";

@Injectable()
export class SocketService {
  public clients = new Map<string, { clientSocket: Socket }>();
  private _socket: Server<SocketEvents, SocketEmitEvents, SocketEmitEvents>;

  constructor() {
    console.log("SocketService constructor ");
    const server = createServer(app.callback());

    this._socket = new Server(server, {
      cors: {
        origin: [
          "http://localhost:3000",
          "https://socket-test-client.netlify.app",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.onConnection((client, clientSocket) => {
      this.clients.set(client.id, { clientSocket });
    });

    console.log("Socket listen on PORT: ", 3232);
    server.listen("3232");
  }

  get socket() {
    if (!this._socket) {
      throw Error("Socket is not initialized");
    }

    return this._socket;
  }

  onConnection = (listener: (client: ProfileDto, socket: Socket) => void) => {
    this.socket?.on("connection", clientSocket => {
      const { headers } = clientSocket.request;
      const cookie = parse(headers.cookie || "");
      const token = cookie?.token ?? clientSocket.handshake.query.token;

      if (token) {
        jwt.verify(token, jwtSecretKey, (err, decoded) => {
          if (err) {
            clientSocket.disconnect(true);

            return;
          }

          const client = decoded as ProfileDto;

          listener?.(client, clientSocket);

          clientSocket.on("disconnect", () => {
            const id = client.id;

            if (this.clients.has(id)) {
              this.clients.delete(id);
            }
          });
        });
      } else {
        clientSocket._error("UnauthorizedException");
        clientSocket.disconnect(true);
      }
    });
  };
}
