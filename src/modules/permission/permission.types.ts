export enum EPermissions {
  // ── Superadmin ────────────────────────────────────────────────────────────
  /** Предоставляет доступ ко всему. Эквивалентно роли ADMIN. */
  ALL = "*",

  // ── User management ───────────────────────────────────────────────────────
  /** Просмотр списка пользователей и их профилей */
  USER_VIEW = "user:view",
  /** Создание, редактирование, блокировка пользователей и назначение ролей */
  USER_MANAGE = "user:manage",

  // ── Contact ─────────────────────────────────────────────────────────────────
  CONTACT_VIEW = "contact:view",
  CONTACT_MANAGE = "contact:manage",
  CONTACT_ALL = "contact:*",

  // ── Chat ────────────────────────────────────────────────────────────────────
  CHAT_VIEW = "chat:view",
  CHAT_MANAGE = "chat:manage",
  CHAT_ALL = "chat:*",

  // ── Message ─────────────────────────────────────────────────────────────────
  MESSAGE_VIEW = "message:view",
  MESSAGE_MANAGE = "message:manage",
  MESSAGE_ALL = "message:*",

  // ── Push ────────────────────────────────────────────────────────────────────
  PUSH_MANAGE = "push:manage",
}
