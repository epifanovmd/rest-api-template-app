import { defineErrors, HttpStatus } from "../../core";

/** Доменные ошибки пространств: коды `WORKSPACE_*`. */
export const WorkspaceError = defineErrors("WORKSPACE", {
  NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: "Рабочее пространство не найдено",
  },
  FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: "Недостаточно прав в рабочем пространстве",
  },
  SLUG_TAKEN: {
    status: HttpStatus.CONFLICT,
    message: "Адрес рабочего пространства уже занят",
  },
  MEMBER_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: "Участник не найден",
  },
  ALREADY_MEMBER: {
    status: HttpStatus.CONFLICT,
    message: "Пользователь уже участник рабочего пространства",
  },
  ROLE_TOO_HIGH: {
    status: HttpStatus.FORBIDDEN,
    message: "Нельзя назначить роль выше своей",
  },
  OWNER_ROLE_VIA_TRANSFER: {
    status: HttpStatus.BAD_REQUEST,
    message: "Роль владельца назначается только передачей владения",
  },
  CANNOT_MANAGE_MEMBER: {
    status: HttpStatus.FORBIDDEN,
    message: "Нельзя изменить участника с ролью выше вашей или владельца",
  },
  OWNER_CANNOT_LEAVE: {
    status: HttpStatus.CONFLICT,
    message:
      "Владелец не может покинуть пространство — сначала передайте владение",
  },
  TRANSFER_TO_SELF: {
    status: HttpStatus.BAD_REQUEST,
    message: "Пользователь уже владелец пространства",
  },
  INVITE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: "Приглашение не найдено или отозвано",
  },
  INVITE_EXPIRED: {
    status: HttpStatus.GONE,
    message: "Срок действия приглашения истёк",
  },
  INVITE_ALREADY_USED: {
    status: HttpStatus.CONFLICT,
    message: "Приглашение уже использовано",
  },
  INVITE_EMAIL_MISMATCH: {
    status: HttpStatus.FORBIDDEN,
    message: "Приглашение отправлено на другой email",
  },
});
