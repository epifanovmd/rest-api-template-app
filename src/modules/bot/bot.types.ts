/** Типы событий, на которые бот может подписать вебхук. */
export const WEBHOOK_EVENT_TYPES = [
  "message",
  "command",
  "message_edited",
  "message_deleted",
  "message_reaction",
  "message_pinned",
  "message_unpinned",
  "member_joined",
  "member_left",
  "member_role_changed",
  "member_banned",
  "member_unbanned",
  "chat_created",
  "chat_updated",
  "poll_created",
  "poll_voted",
  "poll_closed",
  "call_initiated",
  "call_ended",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Очередь доставки вебхуков: одна задача — одно событие одному боту. */
export const BOT_WEBHOOK_QUEUE = "bot.webhook";

/** Периодическая очистка журнала доставок вебхуков. */
export const BOT_WEBHOOK_LOGS_CLEANUP_QUEUE = "bot.webhook-logs-cleanup";

/** Срок хранения журнала доставок вебхуков, дней. */
export const BOT_WEBHOOK_LOG_RETENTION_DAYS = 30;

/** Попыток доставки одного события (первая + повторы). */
export const WEBHOOK_MAX_ATTEMPTS = 6;

/** Задержка первого повтора, секунд; дальше — экспоненциально. */
export const WEBHOOK_RETRY_DELAY_SECONDS = 5;

/** Таймаут одного HTTP-запроса вебхука, мс. */
export const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Подряд проваленных доставок (все попытки исчерпаны), после которых вебхук
 * отключается автоматически.
 */
export const WEBHOOK_FAILURE_THRESHOLD = 10;

/** Данные задачи `bot.webhook`. */
export interface IBotWebhookJobData {
  botId: string;
  /** Идентификатор доставки: один на событие и бота, общий для всех попыток. */
  deliveryId: string;
  eventType: string;
  payload: Record<string, unknown>;
  /** Время события, мс: одинаково во всех попытках. */
  timestamp: number;
}

/** Результат одной попытки доставки. */
export interface IWebhookAttemptResult {
  success: boolean;
  statusCode: number | null;
  errorMessage: string | null;
  durationMs: number;
  /** Повтор бессмыслен: адрес заблокирован SSRF-защитой или некорректен. */
  permanent: boolean;
}
