/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
export interface ISocketBotWebhookDisabledPayload {
  botId: string;
  /** Подряд проваленных доставок на момент отключения. */
  failureCount: number;
  lastError: string | null;
}

declare module "../socket/socket.types" {
  interface ISocketEmitEvents {
    /** Вебхук бота отключён после серии проваленных доставок (владельцу) */
    "bot:webhook-disabled": (
      ...args: [ISocketBotWebhookDisabledPayload]
    ) => void;
  }
}
