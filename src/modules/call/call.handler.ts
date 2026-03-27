import { inject } from "inversify";

import { Injectable } from "../../core";
import { ISocketHandler, SocketEmitterService, TSocket } from "../socket";
import { CallRepository } from "./call.repository";

@Injectable()
export class CallHandler implements ISocketHandler {
  constructor(
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(CallRepository)
    private readonly _callRepo: CallRepository,
  ) {}

  private async _verifyCallParticipant(
    callId: string,
    userId: string,
  ): Promise<boolean> {
    const call = await this._callRepo.findById(callId);

    if (!call) return false;

    return call.callerId === userId || call.calleeId === userId;
  }

  onConnection(socket: TSocket): void {
    socket.on("call:offer", async (data: { callId: string; targetUserId: string; sdp: unknown }) => {
      try {
        const isParticipant = await this._verifyCallParticipant(
          data.callId,
          socket.data.userId,
        );

        if (!isParticipant) {
          socket.emit("error", {
            event: "call:offer",
            message: "Not a participant of this call",
          });

          return;
        }

        this._emitter.toUser(data.targetUserId, "call:offer", {
          callId: data.callId,
          fromUserId: socket.data.userId,
          sdp: data.sdp,
        });
      } catch (error) {
        socket.emit("error", {
          event: "call:offer",
          message: "Failed to process call offer",
        });
      }
    });

    socket.on("call:answer", async (data: { callId: string; targetUserId: string; sdp: unknown }) => {
      try {
        const isParticipant = await this._verifyCallParticipant(
          data.callId,
          socket.data.userId,
        );

        if (!isParticipant) {
          socket.emit("error", {
            event: "call:answer",
            message: "Not a participant of this call",
          });

          return;
        }

        this._emitter.toUser(data.targetUserId, "call:answer", {
          callId: data.callId,
          fromUserId: socket.data.userId,
          sdp: data.sdp,
        });
      } catch (error) {
        socket.emit("error", {
          event: "call:answer",
          message: "Failed to process call answer",
        });
      }
    });

    socket.on("call:ice-candidate", async (data: { callId: string; targetUserId: string; candidate: unknown }) => {
      try {
        const isParticipant = await this._verifyCallParticipant(
          data.callId,
          socket.data.userId,
        );

        if (!isParticipant) {
          socket.emit("error", {
            event: "call:ice-candidate",
            message: "Not a participant of this call",
          });

          return;
        }

        this._emitter.toUser(data.targetUserId, "call:ice-candidate", {
          callId: data.callId,
          fromUserId: socket.data.userId,
          candidate: data.candidate,
        });
      } catch (error) {
        socket.emit("error", {
          event: "call:ice-candidate",
          message: "Failed to process ICE candidate",
        });
      }
    });

    socket.on("call:hangup", async (data: { callId: string; targetUserId: string }) => {
      try {
        const isParticipant = await this._verifyCallParticipant(
          data.callId,
          socket.data.userId,
        );

        if (!isParticipant) {
          socket.emit("error", {
            event: "call:hangup",
            message: "Not a participant of this call",
          });

          return;
        }

        this._emitter.toUser(data.targetUserId, "call:ended", {
          callId: data.callId,
          endedBy: socket.data.userId,
        });
      } catch (error) {
        socket.emit("error", {
          event: "call:hangup",
          message: "Failed to process hangup",
        });
      }
    });
  }
}
