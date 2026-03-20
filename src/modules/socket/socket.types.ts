import { Server, Socket as SocketIO } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

import { AuthContext } from "../../types/koa";

// ─── WireGuard data shapes ────────────────────────────────────────────────────

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

// ─── Client → Server events ───────────────────────────────────────────────────

export interface ISocketEvents {
  /** Subscribe to a specific server's real-time stats */
  "wg:subscribe:server": (serverId: string) => void;
  "wg:unsubscribe:server": (serverId: string) => void;

  /** Subscribe to a specific peer's real-time stats */
  "wg:subscribe:peer": (peerId: string) => void;
  "wg:unsubscribe:peer": (peerId: string) => void;

  /** Subscribe to overview stats (admins) */
  "wg:subscribe:overview": () => void;
  "wg:unsubscribe:overview": () => void;
}

// ─── Server → Client events ───────────────────────────────────────────────────

export interface ISocketEmitEvents {
  authenticated: (...args: [{ userId: string }]) => void;
  auth_error: (...args: [{ message: string }]) => void;

  /** Per-server status change */
  "wg:server:status": (...args: [WgServerStatusPayload]) => void;

  /** Per-server aggregated traffic + speed stats */
  "wg:server:stats": (...args: [WgServerStatsPayload]) => void;

  /** Per-peer DB status change */
  "wg:peer:status": (...args: [WgPeerStatusPayload]) => void;

  /** Per-peer connection activity change */
  "wg:peer:active": (...args: [WgPeerActivePayload]) => void;

  /** Per-peer traffic + speed stats */
  "wg:peer:stats": (...args: [WgPeerStatsPayload]) => void;

  /** Global VPN overview */
  "wg:stats:overview": (...args: [WgOverviewStatsPayload]) => void;
}

// ─── Socket types ─────────────────────────────────────────────────────────────

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
