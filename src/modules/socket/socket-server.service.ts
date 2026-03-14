import { inject } from "inversify";
import { Server } from "socket.io";

import { config } from "../../config";
import { HttpServer, Injectable, logger } from "../../core";
import { TServer } from "./socket.types";

const { cors } = config;

@Injectable()
export class SocketServerService {
  private readonly _io: TServer;

  constructor(@inject(HttpServer) httpServer: HttpServer) {
    this._io = new Server(httpServer, {
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

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._io.close(err => {
        if (err) return reject(err);
        logger.info("[Socket] Server closed");
        resolve();
      });
    });
  }
}
