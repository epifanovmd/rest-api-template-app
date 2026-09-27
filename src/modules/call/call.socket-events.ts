/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
import type { CallDto } from "./dto/call.dto";

export interface ISocketCallSignalPayload {
  callId: string;
  sdp: unknown;
}

export interface ISocketCallIceCandidatePayload {
  callId: string;
  candidate: unknown;
}

export interface ISocketCallHangupPayload {
  callId: string;
}

export interface ISocketCallEndedPayload {
  callId: string;
  endedBy: string;
}

export interface ISocketCallRelayPayload {
  callId: string;
  fromUserId: string;
  sdp: unknown;
}

export interface ISocketCallIceCandidateRelayPayload {
  callId: string;
  fromUserId: string;
  candidate: unknown;
}

declare module "../socket/socket.types" {
  interface ISocketEvents {
    /** Relay SDP offer */
    "call:offer": (data: ISocketCallSignalPayload) => void;
    /** Relay SDP answer */
    "call:answer": (data: ISocketCallSignalPayload) => void;
    /** Relay ICE candidate */
    "call:ice-candidate": (data: ISocketCallIceCandidatePayload) => void;
    /** Hangup signal */
    "call:hangup": (data: ISocketCallHangupPayload) => void;
  }

  interface ISocketEmitEvents {
    /** Входящий звонок */
    "call:incoming": (...args: [CallDto]) => void;
    /** Звонок принят */
    "call:answered": (...args: [CallDto]) => void;
    /** Звонок отклонён */
    "call:declined": (...args: [CallDto]) => void;
    /** Звонок завершён */
    "call:ended": (...args: [CallDto | ISocketCallEndedPayload]) => void;
    /** Пропущенный звонок */
    "call:missed": (...args: [CallDto]) => void;
    /** Relay SDP offer */
    "call:offer": (...args: [ISocketCallRelayPayload]) => void;
    /** Relay SDP answer */
    "call:answer": (...args: [ISocketCallRelayPayload]) => void;
    /** Relay ICE candidate */
    "call:ice-candidate": (
      ...args: [ISocketCallIceCandidateRelayPayload]
    ) => void;
  }
}
