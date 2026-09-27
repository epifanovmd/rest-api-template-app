import { defineErrors } from "../../core";

/** Доменные ошибки контактов и блокировок: коды `CONTACT_*`. */
export const ContactError = defineErrors("CONTACT", {
  NOT_FOUND: { status: 404, message: "Контакт не найден" },
  USER_NOT_FOUND: { status: 404, message: "Пользователь не найден" },
  SELF: { status: 400, message: "Нельзя добавить себя в контакты" },
  BLOCKED: { status: 403, message: "Контакт заблокирован" },
  ALREADY_EXISTS: { status: 409, message: "Контакт уже существует" },
  NOT_PENDING: {
    status: 400,
    message: "Контакт не ожидает подтверждения",
  },
  REMOVE_BLOCKED: {
    status: 409,
    message: "Пользователь заблокирован — снимите блокировку",
  },
  NOT_BLOCKED: { status: 404, message: "Пользователь не заблокирован" },
  INVALID_STATUS: { status: 400, message: "Недопустимый статус контакта" },
});
