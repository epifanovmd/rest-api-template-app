import { ForbiddenException } from "@force-dev/utils";
import { createServer } from "http";
import Koa from "koa";
import { Server } from "socket.io";

// import { RateLimiterMemory } from "rate-limiter-flexible";
import { config } from "../../../config";
import { verifyAuthToken } from "../../common";
import { Injectable } from "../../core";
import { IUserDto } from "../user/user.dto";
import {
  ISocketEmitEvents,
  ISocketEvents,
  TServer,
  TSocket,
} from "./socket.types";

const NODE_ENV = process.env.NODE_ENV;

const { socket, cors } = config;

// // Ограничитель запросов
// const rateLimiter = new RateLimiterMemory({
//   points: 10, // 10 запросов
//   duration: 1, // за 1 секунду
// });

@Injectable()
export class SocketService {
  private _server: ReturnType<typeof createServer>;
  private _io: TServer;
  public _clients = new Map<string, { socket: TSocket; user: IUserDto }>();

  constructor(app: Koa) {
    this._server = createServer(app.callback());

    this._io = new Server(this._server, {
      cors: {
        origin: this.parseCorsOrigins(),
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket"], // Отключаем long-polling
      serveClient: false, // Не обслуживаем клиентские файлы
      pingTimeout: 10000,
      pingInterval: 25000,
      cookie: NODE_ENV === "production",
    });

    this.setupConnectionHandling();
    this.startServer().then();

    console.info(`Socket server listening on port ${socket.port}`);
  }

  private parseCorsOrigins(): string[] | boolean {
    if (cors.allowedIps.join() === "*") return true;

    return cors.allowedIps;
  }

  private async startServer(): Promise<void> {
    return new Promise(resolve => {
      this._server.listen(socket.port, () => resolve());
    });
  }

  use(middleware: (socket: TSocket, next: (err?: Error) => void) => void) {
    return this._io.use(middleware);
  }

  private setupConnectionHandling(): void {
    // Применяем промежуточное ПО
    this._io.use(async (socket, next) => {
      try {
        await new Promise<void>((resolve, reject) => {
          const token = this.extractToken(socket);

          if (!token) {
            return reject(new ForbiddenException());
          }

          verifyAuthToken(token)
            .then(user => {
              if (user) {
                socket.data = user;
                resolve();
              } else {
                reject(new ForbiddenException());
              }
            })
            .catch(err => reject(new ForbiddenException(err.message)));
        });

        next();
      } catch (e) {
        socket.disconnect();
        next(e);
      }
    });

    // Обработка подключений
    this._io.on("connection", async (socket: TSocket) => {
      try {
        // Проверка ограничения скорости
        // await rateLimiter.consume(socket.handshake.address);
        const user = socket.data;

        this.handleNewConnection(socket, user);

        socket.on("disconnect", () => this.handleDisconnect(socket, user.id));
        socket.on("error", err => this.handleSocketError(socket, err));
      } catch (err) {
        this.handleConnectionError(socket, err);
      }
    });
  }

  private extractToken(socket: TSocket): string | null {
    const token = socket.handshake.auth.token;

    return token?.startsWith("Bearer ") ? token.slice(7) : null;
  }

  private handleNewConnection(socket: TSocket, user: IUserDto): void {
    this._clients.set(user.id, { socket, user });

    // Отправляем клиенту его ID
    socket.emit("authenticated", { userId: user.id });
  }

  private handleDisconnect(socket: TSocket, userId: string): void {
    this._clients.delete(userId);
    console.info(`Client disconnected: ${userId}`, { clientId: socket.id });
  }

  private handleSocketError(socket: TSocket, err: Error): void {
    console.error(`Socket error: ${err.message}`, {
      clientId: socket.id,
      error: err.stack,
    });
    socket.disconnect(true);
  }

  private handleConnectionError(socket: TSocket, err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));

    console.warn(`Connection error: ${error.message}`, {
      clientId: socket.id,
      error: error.stack,
    });

    socket.emit("auth_error", { message: error.message });
    socket.disconnect(true);
  }

  get io(): TServer {
    return this._io;
  }

  getClient(userId: string): TSocket | undefined {
    return this._clients.get(userId)?.socket;
  }

  broadcastToRoom<K extends keyof ISocketEmitEvents>(
    room: string,
    event: K,
    ...args: Parameters<ISocketEmitEvents[K]>
  ): void {
    this._io.to(room).emit<any>(event, args);
  }

  notifyUser<K extends keyof ISocketEmitEvents>(
    userId: string,
    event: K,
    ...args: Parameters<ISocketEmitEvents[K]>
  ): boolean {
    const client = this._clients.get(userId);

    if (!client) return false;

    client.socket.emit<any>(event, args);

    return true;
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Отключаем всех клиентов
      this._clients.forEach(({ socket }) => socket.disconnect(true));
      this._clients.clear();

      // Закрываем сервер
      this._io.close(err => {
        if (err) return reject(err);
        this._server.close(() => resolve());
      });
    });
  }
}
