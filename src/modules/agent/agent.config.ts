import { z } from "zod";

import { defineModuleConfig, positiveInt } from "../../config";
import { resolveFromRoot } from "../../core";

/** Настройки канала агентов и раздачи сборок (env `AGENT_*`). */
export const agentConfig = defineModuleConfig(
  "agent",
  z.object({
    /** Интервал `status` агента: пульс и продление аренд задач. */
    statusIntervalMs: positiveInt.default(15_000),
    /** Интервал `metrics` агента. */
    metricsIntervalMs: positiveInt.default(15_000),
    /** Без `hello` дольше — соединение закрывается (4400). */
    helloTimeoutMs: positiveInt.default(10_000),
    /** Период ping WebSocket; без pong до следующего — разрыв. */
    pingIntervalMs: positiveInt.default(20_000),
    /** Через сколько после разрыва без новой сессии агент — offline. */
    offlineGraceSec: positiveInt.default(30),
    /** Предел сообщения агента. */
    maxMessageBytes: positiveInt.default(4 * 1024 * 1024),
    /**
     * Токен регистрации из окружения (многоразовый, без записи в БД): агенты
     * в compose и dev регистрируются без ручного выпуска токена. Не короче 32
     * символов; без него — только выпущенные токены.
     */
    bootstrapToken: z
      .string()
      .min(32, "AGENT_BOOTSTRAP_TOKEN — не короче 32 символов")
      .optional(),
    /**
     * Каталог сборок агента: `<version>/manifest.json` и файлы. Относительный
     * путь — от корня проекта.
     */
    releasesDir: z
      .string()
      .min(1)
      .default("agent/dist")
      .transform(resolveFromRoot),
  }),
  {
    statusIntervalMs: process.env.AGENT_STATUS_INTERVAL_MS,
    metricsIntervalMs: process.env.AGENT_METRICS_INTERVAL_MS,
    helloTimeoutMs: process.env.AGENT_HELLO_TIMEOUT_MS,
    pingIntervalMs: process.env.AGENT_PING_INTERVAL_MS,
    offlineGraceSec: process.env.AGENT_OFFLINE_GRACE_SEC,
    maxMessageBytes: process.env.AGENT_MAX_MESSAGE_BYTES,
    releasesDir: process.env.AGENT_RELEASES_DIR || undefined,
    bootstrapToken: process.env.AGENT_BOOTSTRAP_TOKEN || undefined,
  },
);
