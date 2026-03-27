import { HttpException } from "@force-dev/utils";
import { ValidateError } from "@tsoa/runtime";
import { Context, Next } from "koa";

import { isProduction } from "../config";
import { logger } from "../core";

export interface ErrorResponseBody {
  /** HTTP status code */
  status: number;
  /** Краткое описание ошибки (для 5xx — generic, не утекает внутреннее) */
  message: string;
  /** Код ошибки для программной обработки на клиенте */
  code?: string;
  /** Детализация: поля валидации, причина, вложенная ошибка */
  details?: unknown;
  /** Stack trace — только в dev */
  stack?: string;
}

export const errorMiddleware = async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    const body = buildErrorBody(err);

    // Логируем 5xx и неизвестные ошибки
    if (body.status >= 500) {
      logger.error(
        { err, requestId: ctx.state.requestId, path: ctx.path, method: ctx.method },
        `[${body.status}] ${(err as Error).message}`,
      );
    }

    ctx.status = body.status;
    ctx.body = body;
  }
};

function buildErrorBody(err: unknown): ErrorResponseBody {
  // ── tsoa ValidateError (422) — ошибки валидации request params/body
  if (err instanceof ValidateError) {
    return {
      status: 422,
      message: "Validation Failed",
      code: "VALIDATION_ERROR",
      details: err.fields,
    };
  }

  // ── HttpException (@force-dev/utils) — все бизнес-исключения
  if (err instanceof HttpException) {
    return {
      status: err.status,
      message: err.message,
      code: err.name,
      details: resolveReason(err.reason),
      ...devStack(err),
    };
  }

  // ── Generic Error с statusCode / status (koa, другие библиотеки)
  const status = extractStatus(err);
  const isServer = status >= 500;

  return {
    status,
    message: isServer ? "Internal Server Error" : (err as Error).message,
    code: isServer ? "INTERNAL_ERROR" : (err as any).code ?? undefined,
    details: isServer ? undefined : extractDetails(err),
    ...devStack(err),
  };
}

/** Извлечь HTTP status из произвольной ошибки */
function extractStatus(err: unknown): number {
  const e = err as Record<string, unknown>;

  if (typeof e?.statusCode === "number" && e.statusCode >= 100 && e.statusCode < 600) {
    return e.statusCode;
  }
  if (typeof e?.status === "number" && e.status >= 100 && e.status < 600) {
    return e.status;
  }

  return 500;
}

/** Извлечь details из generic error (tsoa fields, zod errors и т.д.) */
function extractDetails(err: unknown): unknown {
  const e = err as Record<string, unknown>;

  return e?.fields ?? e?.errors ?? e?.details ?? undefined;
}

/** Развернуть reason из HttpException в безопасный формат */
function resolveReason(reason: unknown): unknown {
  if (reason === undefined || reason === null) return undefined;
  if (reason instanceof Error) return reason.message;

  return reason;
}

/** Stack trace только в dev — никогда не утекает в production */
function devStack(err: unknown): { stack?: string } {
  if (isProduction) return {};

  const stack = (err as Error)?.stack;

  return stack ? { stack } : {};
}
