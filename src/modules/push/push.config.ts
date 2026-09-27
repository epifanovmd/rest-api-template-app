import { existsSync } from "fs";
import { z } from "zod";

import { defineModuleConfig, isProduction } from "../../config";
import { resolveFromRoot } from "../../core/paths";

export const pushConfig = defineModuleConfig(
  "push",
  z
    .object({
      /** Ключ сервисного аккаунта FCM; путь — от корня проекта. Пусто — push выключен. */
      serviceAccountPath: z
        .string()
        .default("")
        .transform(value => (value ? resolveFromRoot(value) : "")),
    })
    .refine(
      cfg =>
        !isProduction ||
        !cfg.serviceAccountPath ||
        existsSync(cfg.serviceAccountPath),
      {
        path: ["serviceAccountPath"],
        message:
          "Файл ключа Firebase (FIREBASE_SERVICE_ACCOUNT_PATH) не найден",
      },
    ),
  { serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH },
);
