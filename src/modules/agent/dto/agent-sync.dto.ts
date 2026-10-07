/** Конверт сообщения ALP (§4 протокола). */
export interface IAlpEnvelopeDto {
  type: string;
  id?: string;
  re?: string;
  seq?: number;
  ts?: number;
  data?: unknown;
}

/** Пачка обмена HTTP sync: запасной транспорт канала агента. */
export interface IAgentSyncBody {
  /** Сессия из прошлого ответа; `null` — новая сессия (первым идёт `hello`). */
  sessionId?: string | null;
  messages: IAlpEnvelopeDto[];
  /** Ждать доставок, если отдать нечего, секунд (0..25). */
  waitSeconds?: number;
}

export interface IAgentSyncDto {
  sessionId: string;
  messages: IAlpEnvelopeDto[];
}
