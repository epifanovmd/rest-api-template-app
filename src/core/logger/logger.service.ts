import pino, { Logger } from "pino";

import { config } from "../../../config";
import { Injectable } from "../decorators";

const isDevelopment = process.env.NODE_ENV !== "production";

const pinoInstance: Logger = pino({
  level: isDevelopment ? "debug" : "info",
  transport: isDevelopment
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } }
    : undefined,
});

@Injectable()
export class LoggerService {
  private readonly logger: Logger;

  constructor() {
    this.logger = pinoInstance;
  }

  child(bindings: Record<string, unknown>): Logger {
    return this.logger.child(bindings);
  }

  info(msg: string, context?: Record<string, unknown>): void {
    this.logger.info(context ?? {}, msg);
  }

  warn(msg: string, context?: Record<string, unknown>): void {
    this.logger.warn(context ?? {}, msg);
  }

  error(msg: string, error?: unknown, context?: Record<string, unknown>): void {
    this.logger.error({ ...context, err: error }, msg);
  }

  debug(msg: string, context?: Record<string, unknown>): void {
    this.logger.debug(context ?? {}, msg);
  }
}

// Standalone instance for use outside IoC (bootstrap, config errors, etc.)
export const logger = pinoInstance;
