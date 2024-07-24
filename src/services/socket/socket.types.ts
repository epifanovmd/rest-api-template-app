import { Socket as SocketIO } from "socket.io";

export interface ISocketEvents {
  test_event: (...args: [param: string]) => void;
}

export interface ISocketEmitEvents {
  test_emit_event: (...args: [data: any]) => void;
}

export type TSocket = SocketIO<ISocketEvents, ISocketEmitEvents>;
