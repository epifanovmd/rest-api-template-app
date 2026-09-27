import { defineErrors } from "../../core";

/** Доменные ошибки опросов: коды `POLL_*`. «Не участник» — `CHAT_NOT_MEMBER`. */
export const PollError = defineErrors("POLL", {
  NOT_FOUND: { status: 404, message: "Опрос не найден" },
  CLOSED: { status: 400, message: "Опрос закрыт" },
  MESSAGE_DELETED: { status: 400, message: "Сообщение с опросом удалено" },
  INVALID_OPTION: { status: 400, message: "Некорректный вариант ответа" },
  SINGLE_CHOICE: {
    status: 400,
    message: "В этом опросе можно выбрать только один вариант",
  },
  CLOSE_FORBIDDEN: {
    status: 403,
    message: "Закрыть опрос может автор или администратор чата",
  },
});
