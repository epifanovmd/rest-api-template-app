import { Socket as SocketIO } from "socket.io";

export interface SocketEvents {
  test_event: (...args: [param: string]) => void;
}

export interface SocketEmitEvents {
  test_emit_event: (...args: [data: any]) => void;
}

export type Socket = SocketIO<SocketEvents, SocketEmitEvents>;
