import { defineErrors, HttpStatus } from "../../core";

/** Доменные ошибки модуля: коды `NODE_*`. */
export const NodeError = defineErrors("NODE", {
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: "Узел не найден" },
  FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: "Нет права на это действие с узлом",
  },
  USER_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: "Пользователь не найден",
  },
  JOB_RUNNING: {
    status: HttpStatus.CONFLICT,
    message: "У узла уже идёт установка или удаление агента",
  },
  HOST_REQUIRED: {
    status: HttpStatus.BAD_REQUEST,
    message: "Нужен адрес узла: укажите host узла или в запросе",
  },
});
