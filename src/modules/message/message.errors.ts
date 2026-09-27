import { defineErrors } from "../../core";

/**
 * Доменные ошибки сообщений: коды `MESSAGE_*`. Чат не найден и «не участник»
 * — ошибки чата (`CHAT_NOT_FOUND`, `CHAT_NOT_MEMBER`).
 */
export const MessageError = defineErrors("MESSAGE", {
  NOT_FOUND: { status: 404, message: "Сообщение не найдено" },
  INVALID_TYPE: { status: 400, message: "Недопустимый тип сообщения" },
  SEND_FORBIDDEN: {
    status: 403,
    message: "Вы не можете отправлять сообщения в этот чат",
  },
  USER_BLOCKED: {
    status: 403,
    message: "Нельзя отправить сообщение этому пользователю",
  },
  SLOW_MODE: {
    status: 429,
    message: "Slow mode: следующее сообщение позже",
  },
  REPLY_NOT_FOUND: {
    status: 400,
    message: "Сообщение для ответа не найдено",
  },
  FORWARD_NOT_FOUND: {
    status: 400,
    message: "Пересылаемое сообщение не найдено",
  },
  ATTACHMENT_NOT_FOUND: { status: 400, message: "Вложение не найдено" },
  ATTACHMENT_NOT_READY: {
    status: 409,
    message: "Загрузка файла не завершена",
  },
  ATTACHMENT_IN_USE: {
    status: 400,
    message: "Файл уже прикреплён к сообщению",
  },
  NOT_AUTHOR: {
    status: 403,
    message: "Можно редактировать только свои сообщения",
  },
  NOT_EDITABLE: {
    status: 400,
    message: "Редактировать можно только текстовые сообщения",
  },
  DELETED: { status: 400, message: "Сообщение удалено" },
  ALREADY_DELETED: { status: 400, message: "Сообщение уже удалено" },
  DELETE_FORBIDDEN: {
    status: 403,
    message: "Недостаточно прав для удаления сообщения",
  },
  PIN_FORBIDDEN: {
    status: 403,
    message: "Закреплять сообщения могут только администраторы",
  },
  SEARCH_QUERY_TOO_SHORT: {
    status: 400,
    message: "Поисковый запрос слишком короткий",
  },
  INVALID_CURSOR: { status: 400, message: "Некорректный курсор страницы" },
});
