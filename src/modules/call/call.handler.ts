import { inject } from "inversify";

import { Injectable } from "../../core";
import {
  ISocketHandler,
  onValidated,
  SocketEmitterService,
  TSocket,
} from "../socket";
import { CallError } from "./call.errors";
import { CallRepository } from "./call.repository";
import { ECallStatus } from "./call.types";
import {
  SocketCallHangupSchema,
  SocketCallIceCandidateSchema,
  SocketCallSignalSchema,
} from "./validation/call-socket.validate";

/** Статусы, в которых разрешён WebRTC-сигналинг. */
const SIGNALING_STATUSES: ReadonlySet<ECallStatus> = new Set([
  ECallStatus.RINGING,
  ECallStatus.ACTIVE,
]);

/** Лимиты частоты событий на сокет (token bucket). */
export const CALL_SOCKET_LIMITS = {
  /** offer/answer/hangup: единицы за звонок, с запасом на renegotiation. */
  signal: { perSecond: 5, burst: 10 },
  /** ICE-кандидаты идут пачкой при установке соединения. */
  ice: { perSecond: 50, burst: 100 },
} as const;

/**
 * WebRTC-сигналинг между участниками звонка. Адресат — всегда вторая
 * сторона звонка из БД; `targetUserId` клиента не используется.
 */
@Injectable()
export class CallHandler implements ISocketHandler {
  constructor(
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(CallRepository)
    private readonly _callRepo: CallRepository,
  ) {}

  /** Вторая сторона звонка в RINGING/ACTIVE; иначе — `CALL_NOT_ACTIVE`. */
  private async _requirePeer(callId: string, userId: string): Promise<string> {
    const call = await this._callRepo.findById(callId);

    if (call && SIGNALING_STATUSES.has(call.status)) {
      if (call.callerId === userId) return call.calleeId;
      if (call.calleeId === userId) return call.callerId;
    }

    throw CallError.NOT_ACTIVE();
  }

  onConnection(socket: TSocket): void {
    const { userId } = socket.data;

    for (const event of ["call:offer", "call:answer"] as const) {
      onValidated(
        socket,
        event,
        SocketCallSignalSchema,
        async ({ callId, sdp }) => {
          const peerId = await this._requirePeer(callId, userId);

          this._emitter.toUser(peerId, event, {
            callId,
            fromUserId: userId,
            sdp,
          });
        },
        { rateLimit: CALL_SOCKET_LIMITS.signal },
      );
    }

    onValidated(
      socket,
      "call:ice-candidate",
      SocketCallIceCandidateSchema,
      async ({ callId, candidate }) => {
        const peerId = await this._requirePeer(callId, userId);

        this._emitter.toUser(peerId, "call:ice-candidate", {
          callId,
          fromUserId: userId,
          candidate,
        });
      },
      { rateLimit: CALL_SOCKET_LIMITS.ice },
    );

    onValidated(
      socket,
      "call:hangup",
      SocketCallHangupSchema,
      async ({ callId }) => {
        const peerId = await this._requirePeer(callId, userId);

        this._emitter.toUser(peerId, "call:ended", {
          callId,
          endedBy: userId,
        });
      },
      { rateLimit: CALL_SOCKET_LIMITS.signal },
    );
  }
}
