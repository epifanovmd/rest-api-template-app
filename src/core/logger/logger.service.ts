import pino, { Logger } from "pino";

import { Injectable } from "../decorators";

const isDevelopment = process.env.NODE_ENV !== "production";

export const logger: Logger = pino({
  level: isDevelopment ? "debug" : "info",
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
 * Injectable wrapper around the pino logger.
 * Exposes the pino instance directly — use the native pino API.
 */
@Injectable()
export class LoggerService {
  readonly log: Logger = logger;
}
