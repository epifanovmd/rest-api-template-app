/** Связь агента с сервером. */
export enum EAgentStatus {
  ONLINE = "online",
  OFFLINE = "offline",
}

/** Транспорт сессии агента. */
export enum EAgentTransport {
  WS = "ws",
  HTTP = "http",
}

/** Жизненный цикл команды агенту. */
export enum EAgentCommandStatus {
  PENDING = "pending",
  RUNNING = "running",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
  TIMEOUT = "timeout",
  CANCELLED = "cancelled",
}

/** Итоговые статусы команды. */
export const SETTLED_AGENT_COMMAND_STATUSES: readonly EAgentCommandStatus[] = [
  EAgentCommandStatus.SUCCEEDED,
  EAgentCommandStatus.FAILED,
  EAgentCommandStatus.TIMEOUT,
  EAgentCommandStatus.CANCELLED,
];

/** Схема заголовка `Authorization: Agent <agentId>.<secret>`. */
export const AGENT_AUTH_SCHEME = "Agent ";
/** Секрет агента и токена регистрации: 32 байта → 43 символа base64url. */
export const AGENT_SECRET_BYTES = 32;
/** Открытая часть токена регистрации: 6 байт → 8 символов base64url. */
export const ENROLLMENT_TOKEN_PREFIX_BYTES = 6;
export const ENROLLMENT_TOKEN_PREFIX_LENGTH = 8;
/** Длиннее — заведомо не наши учётные данные. */
export const AGENT_CREDENTIAL_MAX_LENGTH = 128;

/** Канал NOTIFY «агенту есть что доставить»; payload — id агента. */
export const AGENT_SIGNAL_CHANNEL = "agent_signal";
/** Канал NOTIFY «сессия агента сменилась»; payload — `<agentId>:<sessionId>`. */
export const AGENT_SESSION_CHANNEL = "agent_session";
export const AGENT_SIGNAL_CHANNELS = [
  AGENT_SIGNAL_CHANNEL,
  AGENT_SESSION_CHANNEL,
] as const;
export type TAgentSignalChannel = (typeof AGENT_SIGNAL_CHANNELS)[number];

/** Отложенная проверка после разрыва: не вернулся — offline. */
export const AGENT_LINK_LOST_QUEUE = "agents.link-lost";
/** Cron: агенты без пульса — offline, просроченные команды — timeout. */
export const AGENT_SWEEP_QUEUE = "agents.sweep";
/** Cron: удаление старых команд и забытых эфемерных агентов. */
export const AGENT_RETENTION_QUEUE = "agents.retention";

/** `lastSeenAt` пишется в БД не чаще этого интервала. */
export const AGENT_TOUCH_INTERVAL_MS = 15_000;
/** Пропущено столько интервалов статуса — агент offline. */
export const AGENT_MISSED_STATUS_LIMIT = 3;
/** Вывод команды хранится не длиннее (символов). */
export const AGENT_COMMAND_OUTPUT_MAX = 256 * 1024;
/** Таймаут команды по умолчанию и предел. */
export const AGENT_COMMAND_DEFAULT_TIMEOUT_SEC = 60;
export const AGENT_COMMAND_MAX_TIMEOUT_SEC = 3_600;
/** Запас к таймауту команды: агент сам сообщает о таймауте раньше. */
export const AGENT_COMMAND_TIMEOUT_GRACE_SEC = 15;
/** Сколько дней хранить завершённые команды. */
export const AGENT_COMMAND_RETENTION_DAYS = 30;
/** Эфемерный агент без связи дольше — удаляется. */
export const AGENT_EPHEMERAL_FORGET_HOURS = 24;
/** Ожидание `welcome` не дольше: HTTP sync long-poll (как у прокси). */
export const AGENT_SYNC_MAX_WAIT_SECONDS = 25;
