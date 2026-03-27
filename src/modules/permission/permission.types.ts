/**
 * Предопределённые permissions.
 * В БД хранятся как строки — можно добавлять новые через API без деплоя.
 * Формат: "domain:action" или "domain:*" (wildcard).
 */
export const Permissions = {
  // ── Superadmin ────────────────────────────────────────────────────────────
  /** Предоставляет доступ ко всему. Эквивалентно роли ADMIN. */
  ALL: "*",

  // ── User management ───────────────────────────────────────────────────────
  /** Просмотр списка пользователей и их профилей */
  USER_VIEW: "user:view",
  /** Создание, редактирование, блокировка пользователей и назначение ролей */
  USER_MANAGE: "user:manage",

  // ── Role management ───────────────────────────────────────────────────────
  ROLE_VIEW: "role:view",
  ROLE_MANAGE: "role:manage",

  // ── Profile ───────────────────────────────────────────────────────────────
  PROFILE_VIEW: "profile:view",
  PROFILE_MANAGE: "profile:manage",

  // ── Contact ───────────────────────────────────────────────────────────────
  CONTACT_VIEW: "contact:view",
  CONTACT_MANAGE: "contact:manage",
  CONTACT_ALL: "contact:*",

  // ── Chat ──────────────────────────────────────────────────────────────────
  CHAT_VIEW: "chat:view",
  CHAT_MANAGE: "chat:manage",
  CHAT_ALL: "chat:*",

  // ── Message ───────────────────────────────────────────────────────────────
  MESSAGE_VIEW: "message:view",
  MESSAGE_MANAGE: "message:manage",
  MESSAGE_ALL: "message:*",

  // ── Push ──────────────────────────────────────────────────────────────────
  PUSH_MANAGE: "push:manage",
} as const;

/** Тип для предопределённых permissions (автодополнение в IDE). */
export type KnownPermission = (typeof Permissions)[keyof typeof Permissions];

/** Permission — произвольная строка; предопределённые значения дают автодополнение. */
export type TPermission = KnownPermission | (string & {});
