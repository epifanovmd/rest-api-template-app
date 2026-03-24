import { Server, Socket as SocketIO } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

import { AuthContext } from "../../types/koa";

// ─── Типы данных WireGuard ──────────────────────────────────────────────

export interface WgServerStatusPayload {
  serverId: string;
  status: "up" | "down" | "error" | "unknown";
  timestamp: Date;
}

export interface WgPeerActivePayload {
  peerId: string;
  serverId: string;
  isActive: boolean;
  lastHandshake: Date | null;
}

export interface WgServerStatsPayload {
  serverId: string;
  interface: string;
  totalRxBytes: number;
  totalTxBytes: number;
  rxSpeedBps: number;
  txSpeedBps: number;
  peerCount: number;
  activePeerCount: number;
  timestamp: Date;
}

export interface WgPeerStatusPayload {
  peerId: string;
  serverId: string;
  status: "up" | "down" | "error" | "unknown";
  timestamp: Date;
}

export interface WgPeerStatsPayload {
  peerId: string;
  serverId: string;
  rxBytes: number;
  txBytes: number;
  rxSpeedBps: number;
  txSpeedBps: number;
  lastHandshake: Date | null;
  isActive: boolean;
  timestamp: Date;
}

export interface WgOverviewStatsPayload {
  totalServers: number;
  activeServers: number;
  totalPeers: number;
  activePeers: number;
  totalRxBytes: number;
  totalTxBytes: number;
  rxSpeedBps: number;
  txSpeedBps: number;
  timestamp: Date;
}

// ─── События Клиент → Сервер ─────────────────────────────────────────────

export interface ISocketEvents {
  /** Подписаться на статистику конкретного сервера в реальном времени */
  "wg:subscribe:server": (serverId: string) => void;
  /** Отписаться от статистики конкретного сервера */
  "wg:unsubscribe:server": (serverId: string) => void;

  /** Подписаться на статистику конкретного пира в реальном времени */
  "wg:subscribe:peer": (peerId: string) => void;
  /** Отписаться от статистики конкретного пира */
  "wg:unsubscribe:peer": (peerId: string) => void;

  /** Подписаться на общую статистику (для администраторов) */
  "wg:subscribe:overview": () => void;
  /** Отписаться от общей статистики */
  "wg:unsubscribe:overview": () => void;
}

// ─── События Сервер → Клиент ─────────────────────────────────────────────

export interface ISocketEmitEvents {
  /** Успешная аутентификация по JWT токену */
  authenticated: (...args: [{ userId: string }]) => void;
  /** Ошибка аутентификации */
  auth_error: (...args: [{ message: string }]) => void;

  /** Изменение статуса конкретного сервера */
  "wg:server:status": (...args: [WgServerStatusPayload]) => void;

  /** Агрегированная статистика трафика + скорости конкретного сервера */
  "wg:server:stats": (...args: [WgServerStatsPayload]) => void;

  /** Изменение статуса пира в БД */
  "wg:peer:status": (...args: [WgPeerStatusPayload]) => void;

  /** Изменение активности соединения пира */
  "wg:peer:active": (...args: [WgPeerActivePayload]) => void;

  /** Статистика трафика + скорости конкретного пира */
  "wg:peer:stats": (...args: [WgPeerStatsPayload]) => void;

  /** Общий обзор VPN */
  "wg:stats:overview": (...args: [WgOverviewStatsPayload]) => void;
}

// ─── Типы Socket ─────────────────────────────────────────────────────────────

export type TSocket = SocketIO<
  ISocketEvents,
  ISocketEmitEvents,
  DefaultEventsMap,
  AuthContext
>;

export type TServer = Server<
  ISocketEvents,
  ISocketEmitEvents,
  DefaultEventsMap,
  AuthContext
>;
