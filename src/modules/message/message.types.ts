export enum EMessageType {
  TEXT = "text",
  IMAGE = "image",
  FILE = "file",
  VOICE = "voice",
  SYSTEM = "system",
  POLL = "poll",
}

export enum EMessageStatus {
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
}

/** Типы, которые клиент может отправить сам; SYSTEM и POLL создаёт только сервер. */
export const CLIENT_MESSAGE_TYPES = [
  EMessageType.TEXT,
  EMessageType.IMAGE,
  EMessageType.FILE,
  EMessageType.VOICE,
] as const;

export type TClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[number];

/**
 * Состояние файла вложения: `processing` — ещё обрабатывается (превью,
 * waveform), `failed` — обработка не удалась. Задаёт модуль file.
 */
export enum EAttachmentStatus {
  PROCESSING = "processing",
  READY = "ready",
  FAILED = "failed",
}
