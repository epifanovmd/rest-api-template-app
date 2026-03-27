/**
 * Предопределённые роли.
 * В БД хранятся как строки — можно добавлять новые через API без деплоя.
 */
export const Roles = {
  ADMIN: "admin",
  USER: "user",
  GUEST: "guest",
} as const;

/** Тип для предопределённых ролей (автодополнение в IDE). */
export type KnownRole = (typeof Roles)[keyof typeof Roles];

/** Роль — произвольная строка; предопределённые значения дают автодополнение. */
export type TRole = KnownRole | (string & {});
