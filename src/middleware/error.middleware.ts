import { ValidateError } from "@tsoa/runtime";
import { Context, Next } from "koa";
import { MulterError } from "multer";

import { isProduction } from "../config";
import {
  defaultErrorCode,
  IErrorResponseDto,
  logger,
  PG_ERROR,
  pgErrorCode,
  reportError,
} from "../core";
import { HttpException } from "../core/http";

/** Тело ответа с ошибкой — контракт `IErrorResponseDto` из ядра. */
export type ErrorResponseBody = IErrorResponseDto;

/** Коды multer о превышении размера или количества — это 413, остальные — 400. */
const MULTER_LIMIT_CODES = new Set<string>([
  "LIMIT_PART_COUNT",
  "LIMIT_FILE_SIZE",
  "LIMIT_FILE_COUNT",
  "LIMIT_FIELD_KEY",
  "LIMIT_FIELD_VALUE",
  "LIMIT_FIELD_COUNT",
]);

/** Извлечь HTTP status из произвольной ошибки */
const extractStatus = (err: unknown): number => {
  const e = err as Record<string, unknown>;

  if (
    typeof e?.statusCode === "number" &&
    e.statusCode >= 100 &&
    e.statusCode < 600
  ) {
    return e.statusCode;
  }
  if (typeof e?.status === "number" && e.status >= 100 && e.status < 600) {
    return e.status;
  }

  return 500;
};

/** Извлечь details из generic error (tsoa fields, zod errors и т.д.) */
const extractDetails = (err: unknown): unknown => {
  const e = err as Record<string, unknown>;

  return e?.fields ?? e?.errors ?? e?.details ?? undefined;
};

/** Развернуть reason из HttpException в безопасный формат */
const resolveReason = (reason: unknown): unknown => {
  if (reason === undefined || reason === null) return undefined;
  if (reason instanceof Error) return reason.message;

  return reason;
};

/** Stack trace только в dev — никогда не утекает в production */
const devStack = (err: unknown): { stack?: string } => {
  if (isProduction) return {};

  const stack = (err as Error)?.stack;

  return stack ? { stack } : {};
};

const buildErrorBody = (err: unknown): ErrorResponseBody => {
  // ── tsoa ValidateError — типы параметров и тела; тот же контракт, что у Zod
  if (err instanceof ValidateError) {
    return {
      status: 400,
      message: "Ошибка валидации запроса",
      code: "VALIDATION_ERROR",
      details: Object.fromEntries(
        Object.entries(err.fields).map(([field, { message }]) => [
          field.replace(/^body\./, ""),
          message,
        ]),
      ),
    };
  }

  // ── MulterError — лимиты загрузки (413) и некорректная форма (400)
  if (err instanceof MulterError) {
    return {
      status: MULTER_LIMIT_CODES.has(err.code) ? 413 : 400,
      message: err.message,
      code: err.code,
      details: err.field === undefined ? undefined : { field: err.field },
    };
  }

  // ── PostgreSQL: значение не того формата (например, «me» вместо uuid в пути) —
  //    ошибка запроса клиента, а не сервера. Текст SQL наружу не отдаём.
  if (pgErrorCode(err) === PG_ERROR.INVALID_TEXT_REPRESENTATION) {
    return {
      status: 400,
      message: "Некорректный формат параметра",
      code: "INVALID_PARAMETER",
    };
  }

  // ── HttpException (core/http) — все бизнес-исключения
  if (err instanceof HttpException) {
    return {
      status: err.status,
      message: err.message,
      code: err.code,
      details: resolveReason(err.reason),
      ...devStack(err),
    };
  }

  // ── Generic Error с statusCode / status (koa, другие библиотеки)
  const status = extractStatus(err);
  const isServer = status >= 500;

  return {
    status,
    message: isServer ? "Внутренняя ошибка сервера" : (err as Error).message,
    code: isServer
      ? "INTERNAL_ERROR"
      : ((err as { code?: string }).code ?? defaultErrorCode(status)),
    details: isServer ? undefined : extractDetails(err),
    ...devStack(err),
  };
};

export const errorMiddleware = async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    const body = buildErrorBody(err);

    // Логируем 5xx и неизвестные ошибки
    if (body.status >= 500) {
      logger.error(
        {
          err,
          requestId: ctx.state.requestId,
          path: ctx.path,
          method: ctx.method,
        },
        `[${body.status}] ${(err as Error).message}`,
      );
    }

    ctx.status = body.status;
    reportError(err, ctx, body.status);
    ctx.body = { ...body, requestId: ctx.state.requestId };
  }
};
