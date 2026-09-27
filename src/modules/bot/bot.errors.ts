import { defineErrors } from "../../core";

export const BotError = defineErrors("BOT", {
  NOT_FOUND: { status: 404, message: "Бот не найден" },
  ACCESS_DENIED: { status: 403, message: "Нет доступа к этому боту" },
  USERNAME_TAKEN: { status: 409, message: "Этот username уже занят" },
  INVALID_TOKEN: { status: 401, message: "Неверный токен бота" },
  TOKEN_REQUIRED: { status: 401, message: "Требуется токен бота" },
  INACTIVE: { status: 400, message: "Бот отключён" },
  NOT_CHAT_MEMBER: {
    status: 403,
    message: "Бот не является участником этого чата",
  },
  MESSAGE_NOT_FOUND: { status: 404, message: "Сообщение не найдено" },
});

/** Коды ошибок доставки вебхука (журнал и `JobError`). */
export const BotWebhookErrorCode = {
  BLOCKED: "BOT_WEBHOOK_BLOCKED",
  DNS_FAILED: "BOT_WEBHOOK_DNS_FAILED",
  TIMEOUT: "BOT_WEBHOOK_TIMEOUT",
  HTTP_ERROR: "BOT_WEBHOOK_HTTP_ERROR",
  NETWORK_ERROR: "BOT_WEBHOOK_NETWORK_ERROR",
  DELIVERY_FAILED: "BOT_WEBHOOK_DELIVERY_FAILED",
} as const;
