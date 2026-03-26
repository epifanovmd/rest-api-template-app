import { inject } from "inversify";

import { Injectable } from "../../core";
import { ISocketHandler, SocketEmitterService, TSocket } from "../socket";

@Injectable()
export class CallHandler implements ISocketHandler {
  constructor(
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
  ) {}

  onConnection(socket: TSocket): void {
    socket.on("call:offer", (data: { callId: string; targetUserId: string; sdp: unknown }) => {
      this._emitter.toUser(data.targetUserId, "call:offer", {
        callId: data.callId,
        fromUserId: socket.data.userId,
        sdp: data.sdp,
      });
    });

    socket.on("call:answer", (data: { callId: string; targetUserId: string; sdp: unknown }) => {
      this._emitter.toUser(data.targetUserId, "call:answer", {
        callId: data.callId,
        fromUserId: socket.data.userId,
        sdp: data.sdp,
      });
    });

    socket.on("call:ice-candidate", (data: { callId: string; targetUserId: string; candidate: unknown }) => {
      this._emitter.toUser(data.targetUserId, "call:ice-candidate", {
        callId: data.callId,
        fromUserId: socket.data.userId,
        candidate: data.candidate,
      });
    });

    socket.on("call:hangup", (data: { callId: string; targetUserId: string }) => {
      this._emitter.toUser(data.targetUserId, "call:ended", {
        callId: data.callId,
        endedBy: socket.data.userId,
      });
    });
  }
}
