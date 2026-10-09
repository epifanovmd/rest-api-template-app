import { z } from "zod";

import {
  defineModuleConfig,
  nonNegativeInt,
  optionalString,
  port,
  positiveInt,
} from "../../config";
import { resolveFromRoot } from "../../core";

/** Экземпляр агента проекта на узле, если `AGENT_INSTANCE` не задан. */
const AGENT_INSTANCE_DEFAULT = "rest";

/** Настройки агентов (env `AGENT_*`). */
export const agentConfig = defineModuleConfig(
  "agent",
  z.object({
    /**
     * Общий токен регистрации из окружения (многоразовый, без записи в БД):
     * агенты в compose и dev регистрируются без выпуска токена. Не короче 32
     * символов; без него — только токены из БД.
     */
    bootstrapToken: z
      .string()
      .min(32, "AGENT_BOOTSTRAP_TOKEN — не короче 32 символов")
      .optional(),
    /** Как часто агент присылает статус, мс. */
    statusIntervalMs: positiveInt.default(15_000),
    /** Как часто агент присылает метрики, мс. */
    metricsIntervalMs: positiveInt.default(15_000),
    /** Точку метрик в историю — не чаще, мс (0 — каждую). */
    metricsStoreIntervalMs: nonNegativeInt.default(60_000),
    /** Сколько хранить историю метрик, часов. */
    metricsRetentionHours: positiveInt.default(168),
    /** Сколько дней хранить события воркеров. */
    eventsRetentionDays: positiveInt.default(14),
    /**
     * Сколько агент считается на связи после обрыва, мс (как в SDK: убитый
     * агент — offline через 3 с).
     */
    offlineGraceMs: positiveInt.default(3_000),
    /**
     * Общий секрет копий API для пересылки вызовов агентов (relay): вызов
     * в копии без соединения агента уходит в копию с соединением на её
     * внутренний сервер пересылки (`relayHost:relayPort`, маршрут
     * `/internal/agent-relay`). Без секрета пересылки и сервера нет (одна
     * копия или липкая маршрутизация по агенту).
     */
    relaySecret: z
      .string()
      .min(32, "AGENT_RELAY_SECRET — не короче 32 символов")
      .optional(),
    /**
     * Порт внутреннего сервера пересылки (отдельно от публичного порта API):
     * у каждой копии на одной машине — свой.
     */
    relayPort: port.default(8182),
    /**
     * Адрес, на котором слушает сервер пересылки: в контейнере — `0.0.0.0`
     * (копии ходят друг к другу по сети compose), иначе — только локально.
     */
    relayHost: z.string().min(1).default("127.0.0.1"),
    /**
     * Внутренний адрес сервера пересылки этой копии (`http://host:port`):
     * по нему другие копии находят её. Без него — `AGENT_RELAY_HOST` (для
     * `0.0.0.0` — IPv4 машины или контейнера) и `AGENT_RELAY_PORT`.
     */
    instanceUrl: optionalString,
    /**
     * Каталог выпуска агента (`manifest.json`, сборки, `install.sh`): его
     * раздаёт `/api/v1/agent-link/releases`. Относительный путь — от корня
     * проекта; без него выпуска нет.
     */
    releasesDir: optionalString.transform(dir =>
      dir ? resolveFromRoot(dir) : undefined,
    ),
    /**
     * Открытый ключ проверки подписи выпуска (base64) — пара к ключу подписи
     * проекта (`AGENT_SIGNING_KEY` при сборке выпуска); `install.sh` передаёт
     * его узлу (`--public-key`).
     */
    publicKey: optionalString,
    /**
     * Экземпляр агента проекта на узле (`agent install --instance`): свои
     * служба `agent-<имя>`, настройки `/etc/agent-<имя>` и данные
     * `/var/lib/agent-<имя>` — агенты других бэкендов на том же узле не
     * мешают. Пустое значение — экземпляр по умолчанию (`agent`).
     */
    instance: z
      .string()
      .regex(
        /^([a-z][a-z0-9-]{0,31})?$/,
        "AGENT_INSTANCE — строчная латиница, цифры и «-», первая — буква, до 32 символов",
      )
      .transform(name => name || undefined),
    /** Адрес сервера для агентов (`install.sh`, ссылки); без него — из запроса. */
    publicUrl: optionalString,
    /**
     * Проверка `data` событий воркеров по `events[].schema` манифеста:
     * `off` — нет; `log` — не подошло: журнал и пометка в истории, событие
     * обрабатывается как обычно; `reject` — то же, но обработчикам модулей
     * оно не передаётся (в истории — с пометкой).
     */
    validateEvents: z
      .string()
      .default("log")
      .pipe(z.enum(["off", "log", "reject"])),
  }),
  {
    bootstrapToken: process.env.AGENT_BOOTSTRAP_TOKEN || undefined,
    statusIntervalMs: process.env.AGENT_STATUS_INTERVAL_MS,
    metricsIntervalMs: process.env.AGENT_METRICS_INTERVAL_MS,
    metricsStoreIntervalMs: process.env.AGENT_METRICS_STORE_INTERVAL_MS,
    metricsRetentionHours: process.env.AGENT_METRICS_RETENTION_HOURS,
    eventsRetentionDays: process.env.AGENT_EVENTS_RETENTION_DAYS,
    offlineGraceMs: process.env.AGENT_OFFLINE_GRACE_MS,
    relaySecret: process.env.AGENT_RELAY_SECRET || undefined,
    relayPort: process.env.AGENT_RELAY_PORT || undefined,
    relayHost: process.env.AGENT_RELAY_HOST || undefined,
    instanceUrl: process.env.INSTANCE_URL,
    releasesDir: process.env.AGENT_RELEASES_DIR,
    publicKey: process.env.AGENT_UPDATE_PUBLIC_KEY,
    instance: process.env.AGENT_INSTANCE ?? AGENT_INSTANCE_DEFAULT,
    publicUrl: process.env.AGENT_PUBLIC_URL,
    validateEvents: process.env.AGENT_VALIDATE_EVENTS || undefined,
  },
);
