import { defineErrors, HttpStatus } from "../../core";

export const AgentError = defineErrors("AGENT", {
  CREDENTIALS_REQUIRED: {
    status: HttpStatus.UNAUTHORIZED,
    message: "Требуются учётные данные агента",
  },
  CREDENTIALS_INVALID: {
    status: HttpStatus.UNAUTHORIZED,
    message: "Неверные или отозванные учётные данные агента",
  },
  ENROLLMENT_TOKEN_INVALID: {
    status: HttpStatus.UNAUTHORIZED,
    message: "Токен регистрации неверен, отозван, просрочен или исчерпан",
  },
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: "Агент не найден" },
  ENROLLMENT_TOKEN_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: "Токен регистрации не найден",
  },
  COMMAND_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: "Команда не найдена",
  },
  COMMAND_NOT_SUPPORTED: {
    status: HttpStatus.BAD_REQUEST,
    message: "Агент не поддерживает эту команду",
  },
  COMMAND_NOT_CANCELLABLE: {
    status: HttpStatus.CONFLICT,
    message: "Команда уже завершена",
  },
  REVOKED: { status: HttpStatus.CONFLICT, message: "Агент отозван" },
  SESSION_EXPIRED: {
    status: HttpStatus.CONFLICT,
    message: "Сессия агента истекла: начните новую с hello",
  },
  SESSION_REPLACED: {
    status: HttpStatus.CONFLICT,
    message: "Сессию агента вытеснила другая",
  },
  HELLO_REQUIRED: {
    status: HttpStatus.BAD_REQUEST,
    message: "Первое сообщение сессии — hello",
  },
  PROTOCOL_UNSUPPORTED: {
    status: HttpStatus.CONFLICT,
    message: "Нет общей версии протокола",
  },
  MESSAGE_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message: "Некорректное сообщение агента",
  },
  UNKNOWN_TYPE: {
    status: HttpStatus.BAD_REQUEST,
    message: "Неизвестный тип сообщения",
  },
  RELEASE_UNSIGNED: {
    status: HttpStatus.CONFLICT,
    message: "Сборка агента без подписи: самообновление на неё невозможно",
  },
  RELEASE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: "Сборка агента не найдена",
  },
});
