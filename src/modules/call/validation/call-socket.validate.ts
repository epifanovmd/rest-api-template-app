import { z } from "zod";

/** Предел SDP в байтах JSON: обычный offer — единицы КБ. */
export const MAX_SDP_BYTES = 64 * 1024;
/** Предел ICE-кандидата в байтах JSON. */
export const MAX_ICE_CANDIDATE_BYTES = 4 * 1024;

const jsonSize = (value: unknown) =>
  Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");

/** Произвольные данные WebRTC, которые сервер пересылает как есть, с пределом размера. */
const opaque = (maxBytes: number, field: string) =>
  z
    .unknown()
    .refine(v => v !== undefined && v !== null, `${field} обязателен`)
    .refine(v => jsonSize(v) <= maxBytes, `${field} больше ${maxBytes} байт`);

const callId = z.string().uuid("Некорректный UUID");

/** `call:offer`, `call:answer`. */
export const SocketCallSignalSchema = z.object({
  callId,
  sdp: opaque(MAX_SDP_BYTES, "sdp"),
});

/** `call:ice-candidate`. */
export const SocketCallIceCandidateSchema = z.object({
  callId,
  candidate: opaque(MAX_ICE_CANDIDATE_BYTES, "candidate"),
});

/** `call:hangup`. */
export const SocketCallHangupSchema = z.object({ callId });
