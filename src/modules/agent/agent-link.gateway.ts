import type { IncomingMessage } from "http";
import { inject } from "inversify";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";

import { config } from "../../config";
import {
  EventBus,
  HttpException,
  HttpServer,
  IBootstrap,
  Injectable,
  logger,
} from "../../core";
import { agentConfig } from "./agent.config";
import type { Agent } from "./agent.entity";
import { AgentService } from "./agent.service";
import { EAgentTransport } from "./agent.types";
import { AgentCapabilityRegistry } from "./agent-capability.registry";
import { readAgentAuthorization } from "./agent-credentials";
import {
  AGENT_LINK_PATH,
  ALP_SUBPROTOCOL,
  EAgentLinkClose,
} from "./agent-link.protocol";
import { AgentPresenceStore } from "./agent-presence.store";
import { AgentSession, IAgentTransport } from "./agent-session";
import { AgentSessionHub } from "./agent-session.hub";
import { AgentSignals } from "./agent-signals";
import { AgentSyncService } from "./agent-sync.service";

/** Как часто перепроверяется, не отозваны ли агенты открытых сессий. */
const REVOCATION_CHECK_MS = 60_000;

const STATUS_TEXT: Record<number, string> = {
  401: "Unauthorized",
  403: "Forbidden",
  426: "Upgrade Required",
};

/** Ответ на upgrade без установки соединения. */
const rejectUpgrade = (socket: Duplex, status: number): void => {
  socket.write(
    `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
};

/** Адрес агента: за прокси — первый `X-Forwarded-For`. */
const remoteIpOf = (req: IncomingMessage): string | undefined => {
  const forwarded = req.headers["x-forwarded-for"];

  if (config.server.trustProxy && typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim();
  }

  return req.socket.remoteAddress;
};

const offersSubprotocol = (req: IncomingMessage): boolean =>
  (req.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map(value => value.trim())
    .includes(ALP_SUBPROTOCOL);

/** Транспорт сессии поверх WebSocket. */
class WsTransport implements IAgentTransport {
  readonly kind = EAgentTransport.WS;

  constructor(private readonly _ws: WebSocket) {}

  send(raw: string): void {
    if (this._ws.readyState === WebSocket.OPEN) this._ws.send(raw);
  }

  close(code: number, reason: string): void {
    if (this._ws.readyState === WebSocket.OPEN) this._ws.close(code, reason);
  }
}

/**
 * Шлюз канала агентов: WebSocket на пути `AGENT_LINK_PATH` рядом с HTTP API
 * (остальные upgrade достаются Socket.IO). Учётные данные проверяются до
 * upgrade. Живость — ping/pong; разрыв без возврата агента за время ожидания
 * — offline (отложенной задачей). Работает на процессах с HTTP
 * (`APP_ROLE=api|all`).
 */
@Injectable()
export class AgentLinkGateway implements IBootstrap {
  readonly critical = false;

  private _wss: WebSocketServer | null = null;
  private readonly _timers: NodeJS.Timeout[] = [];
  private readonly _alive = new WeakSet<WebSocket>();
  private _stopping = false;

  constructor(
    @inject(HttpServer) private readonly _server: HttpServer,
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(AgentPresenceStore) private readonly _presence: AgentPresenceStore,
    @inject(AgentCapabilityRegistry)
    private readonly _capabilities: AgentCapabilityRegistry,
    @inject(AgentSessionHub) private readonly _hub: AgentSessionHub,
    @inject(AgentSignals) private readonly _signals: AgentSignals,
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(AgentSyncService) private readonly _sync: AgentSyncService,
  ) {}

  async initialize(): Promise<void> {
    if (config.app.role === "worker") return;

    this._wss = new WebSocketServer({
      noServer: true,
      maxPayload: agentConfig.maxMessageBytes,
      handleProtocols: () => ALP_SUBPROTOCOL,
    });
    await this._signals.start();
    this._hub.listen();
    this._server.on("upgrade", this._onUpgrade);
    this._timers.push(
      setInterval(() => this._ping(), agentConfig.pingIntervalMs),
      setInterval(() => void this._checkRevoked(), REVOCATION_CHECK_MS),
    );
    this._timers.forEach(timer => timer.unref());
  }

  async destroy(): Promise<void> {
    if (!this._wss) return;

    this._stopping = true;
    this._timers.forEach(timer => clearInterval(timer));
    this._server.off("upgrade", this._onUpgrade);
    this._hub.stop();
    this._sync.stop();
    // Агенты переподключатся к другому процессу или к этому после рестарта.
    this._hub.each(session =>
      session.close(EAgentLinkClose.Restart, "server restarting"),
    );
    await new Promise<void>(resolve => this._wss!.close(() => resolve()));
    await this._signals.stop();
  }

  private readonly _onUpgrade = (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    if (path !== AGENT_LINK_PATH || !this._wss) return;

    if (!offersSubprotocol(req)) {
      rejectUpgrade(socket, 426);

      return;
    }

    const credentials = readAgentAuthorization(req.headers.authorization);

    if (!credentials) {
      rejectUpgrade(socket, 401);

      return;
    }

    this._agents
      .authenticate(credentials)
      .then(agent => {
        if (this._stopping) {
          rejectUpgrade(socket, 503);

          return;
        }

        this._wss!.handleUpgrade(req, socket, head, ws =>
          this._accept(ws, agent, remoteIpOf(req)),
        );
      })
      .catch(err => {
        const status = err instanceof HttpException ? err.status : 500;

        if (status >= 500) logger.error({ err }, "[Agent] Upgrade канала");
        rejectUpgrade(socket, status);
      });
  };

  private _accept(
    ws: WebSocket,
    agent: Agent,
    remoteIp: string | undefined,
  ): void {
    const session = new AgentSession(
      agent,
      new WsTransport(ws),
      {
        agents: this._agents,
        presence: this._presence,
        capabilities: this._capabilities,
        eventBus: this._eventBus,
      },
      remoteIp,
    );

    this._alive.add(ws);
    this._hub.add(session);
    logger.info({ agentId: agent.id, remoteIp }, "[Agent] Канал открыт");

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        session.close(EAgentLinkClose.Protocol, "binary frames unsupported");

        return;
      }

      session.receive(data.toString());
    });
    ws.on("pong", () => this._alive.add(ws));
    ws.on("close", code => {
      this._hub.remove(session);
      void session.dispose();
      logger.info({ agentId: agent.id, code }, "[Agent] Канал закрыт");
      if (session.greeted && !this._stopping) {
        void this._agents.scheduleOfflineCheck(agent.id, session.sessionId);
      }
    });
    ws.on("error", err =>
      logger.warn({ err, agentId: agent.id }, "[Agent] Ошибка сокета агента"),
    );
  }

  /** Без pong с прошлого ping — соединение мертво. */
  private _ping(): void {
    for (const ws of this._wss?.clients ?? []) {
      if (!this._alive.has(ws)) {
        ws.terminate();
        continue;
      }

      this._alive.delete(ws);
      ws.ping();
    }
  }

  /** Отзыв, пропущенный сигналом (LISTEN недоступен), — закрыть сессии. */
  private async _checkRevoked(): Promise<void> {
    const ids = this._hub.agentIds();

    if (!ids.length) return;

    try {
      for (const id of await this._agents.findInactive(ids)) {
        this._hub.closeAgent(id, EAgentLinkClose.Unauthorized, "agent revoked");
      }
    } catch (err) {
      logger.warn({ err }, "[Agent] Проверка отзыва агентов");
    }
  }
}
