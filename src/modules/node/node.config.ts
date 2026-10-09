import { z } from "zod";

import { defineModuleConfig, optionalString } from "../../config";

/** Настройки узлов (env `NODE_*`). */
export const nodeConfig = defineModuleConfig(
  "node",
  z.object({
    /**
     * Ключ шифрования SSH-данных в задачах установки (AES-256-GCM): 32 байта
     * hex или base64. Без него — ключ, производный от `JWT_SECRET_KEY`.
     */
    secretsKey: optionalString,
  }),
  {
    secretsKey: process.env.NODE_SECRETS_KEY,
  },
);
