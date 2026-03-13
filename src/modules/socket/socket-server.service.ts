import { createServer, Server as HttpServer } from "http";
import { inject } from "inversify";
import Koa from "koa";
import { Server } from "socket.io";

import { config } from "../../../config";
import { Injectable } from "../../core";
import { TServer } from "./socket.types";

const { socket, cors } = config;

@Injectable()
export class SocketServerService {
  private readonly _httpServer: HttpServer;
  private readonly _io: TServer;

  constructor(@inject(Koa) koa: Koa) {
    this._httpServer = createServer(koa.callback());

    this._io = new Server(this._httpServer, {
      cors: {
        origin: cors.allowedIps.join() === "*" ? true : cors.allowedIps,
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket"],
      serveClient: false,
      pingTimeout: 10000,
      pingInterval: 25000,
      cookie: process.env.NODE_ENV === "production",
    });
  }

  get io(): TServer {
    return this._io;
  }

  async listen(): Promise<void> {
    return new Promise(resolve => {
      this._httpServer.listen(socket.port, () => {
        console.info(`[Socket] Server listening on port ${socket.port}`);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._io.close(err => {
        if (err) return reject(err);
        this._httpServer.close(() => resolve());
      });
    });
  }
}
