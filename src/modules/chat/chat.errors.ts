import { defineErrors } from "../../core";

/** Доменные ошибки чатов, модерации, приглашений и папок: коды `CHAT_*`. */
export const ChatError = defineErrors("CHAT", {
  NOT_FOUND: { status: 404, message: "Чат не найден" },
  NOT_MEMBER: {
    status: 403,
    message: "Вы не являетесь участником этого чата",
  },
  ADMIN_REQUIRED: { status: 403, message: "Недостаточно прав" },
  OWNER_REQUIRED: {
    status: 403,
    message: "Только владелец чата может выполнить это действие",
  },
  BANNED: { status: 403, message: "Вы заблокированы в этом чате" },
  USER_BANNED: {
    status: 403,
    message: "Нельзя добавить пользователя, заблокированного в этом чате",
  },
  USER_BLOCKED: {
    status: 403,
    message: "Действие недоступно: один из пользователей заблокировал другого",
  },
  USER_NOT_FOUND: { status: 400, message: "Пользователь не найден" },
  SELF_CHAT: { status: 400, message: "Нельзя создать чат с самим собой" },
  DIRECT_NOT_SUPPORTED: {
    status: 400,
    message: "Операция недоступна для личного чата",
  },
  NOT_GROUP: {
    status: 400,
    message: "Добавлять участников можно только в групповой чат",
  },
  NOT_CHANNEL: { status: 400, message: "Это не канал" },
  CHANNEL_PRIVATE: { status: 403, message: "Канал не является публичным" },
  NOT_SUBSCRIBED: { status: 400, message: "Вы не подписаны на этот канал" },
  USERNAME_TAKEN: { status: 409, message: "Этот username уже занят" },
  MEMBER_NOT_FOUND: { status: 404, message: "Участник не найден" },
  SELF_REMOVE: {
    status: 400,
    message: "Чтобы выйти из чата, используйте выход",
  },
  CANNOT_MODERATE: {
    status: 403,
    message: "Недостаточно прав для действия над этим участником",
  },
  SELF_ROLE_CHANGE: {
    status: 400,
    message: "Нельзя изменить собственную роль",
  },
  OWNER_ROLE_VIA_TRANSFER: {
    status: 400,
    message: "Роль владельца назначается только передачей прав",
  },
  ROLE_NOT_ALLOWED: {
    status: 400,
    message: "Эта роль недоступна для данного типа чата",
  },
  OWNER_ROLE_IMMUTABLE: {
    status: 403,
    message: "Нельзя изменить роль владельца",
  },
  ALREADY_OWNER: { status: 400, message: "Вы уже владелец чата" },
  OWNER_MUST_TRANSFER: {
    status: 409,
    message: "Передайте права владельца другому участнику перед выходом",
  },
  SEARCH_QUERY_TOO_SHORT: {
    status: 400,
    message: "Поисковый запрос слишком короткий",
  },
  INVITE_NOT_FOUND: {
    status: 404,
    message: "Приглашение не найдено или неактивно",
  },
  INVITE_EXPIRED: { status: 400, message: "Приглашение истекло" },
  INVITE_EXHAUSTED: {
    status: 400,
    message: "Лимит использований приглашения исчерпан",
  },
  INVITE_INVALID_EXPIRY: {
    status: 400,
    message: "Срок действия должен быть в будущем",
  },
  FOLDER_NOT_FOUND: { status: 404, message: "Папка не найдена" },
  FOLDER_NAME_TAKEN: {
    status: 409,
    message: "Папка с таким названием уже существует",
  },
  FOLDER_LIMIT: { status: 409, message: "Достигнут лимит папок" },
  SELF_BAN: { status: 403, message: "Нельзя заблокировать самого себя" },
  NOT_BANNED: {
    status: 404,
    message: "Пользователь не заблокирован в этом чате",
  },
});
