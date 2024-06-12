import { Socket as SocketIO } from "socket.io";
import { WireguardClient } from "../wireguard";

export interface SocketEvents {
  subscribeToAll: () => void;
  unsubscribeFromAll: () => void;
  subscribeToClient: (...args: [clientId: string]) => void;
  unsubscribeFromClient: (...args: [clientId: string]) => void;
}

export interface SocketEmitEvents {
  all: (...args: [data: WireguardClient[]]) => void;
  client: (...args: [data: WireguardClient]) => void;
}

export type Socket = SocketIO<SocketEvents, SocketEmitEvents>;
