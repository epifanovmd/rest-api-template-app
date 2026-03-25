import pino, { Logger } from "pino";

import { isDevelopment } from "../../config";
import { Injectable } from "../decorators";

export const logger: Logger = pino({
  level: isDevelopment ? "debug" : "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.secretKey",
    ],
    censor: "[REDACTED]",
  },
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:dd/mm/yyyy HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

/**
 * Injectable-обёртка над pino-логгером.
 * Предоставляет экземпляр pino напрямую — используйте нативный API pino.
 */
@Injectable()
export class LoggerService {
  readonly log: Logger = logger;
}
