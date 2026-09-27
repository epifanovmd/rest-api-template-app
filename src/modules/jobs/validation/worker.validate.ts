import { z } from "zod";

import {
  WORKER_CLAIM_MAX_JOBS,
  WORKER_CLAIM_MAX_WAIT_SECONDS,
  WORKER_HEARTBEAT_MAX_EVENTS,
} from "../jobs.types";

const queueName = z
  .string()
  .min(1)
  .max(100, "Имя очереди — до 100 символов")
  .regex(/^[\w.\-/]+$/, "Имя очереди: буквы, цифры, _ . - /");

const attempt = z.number().int().min(0).optional();

const WorkerInfoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Имя воркера обязательно")
    .max(200, "Имя воркера — до 200 символов"),
  meta: z
    .record(z.string().max(50), z.string().max(200))
    .refine(meta => Object.keys(meta).length <= 20, {
      message: "Не больше 20 полей",
    })
    .optional(),
});

export const ClaimJobsSchema = z.object({
  queues: z
    .array(queueName)
    .min(1, "Нужна хотя бы одна очередь")
    .max(20, "Не больше 20 очередей"),
  max: z.number().int().min(1).max(WORKER_CLAIM_MAX_JOBS).optional(),
  waitSeconds: z.number().min(0).max(WORKER_CLAIM_MAX_WAIT_SECONDS).optional(),
  worker: WorkerInfoSchema.optional(),
});

export const HeartbeatJobSchema = z.object({
  attempt,
  progress: z.number().min(0).max(1).optional(),
  text: z.string().max(200, "text — до 200 символов").optional(),
  log: z
    .array(z.string().max(1_000, "Строка лога — до 1000 символов"))
    .max(100, "Не больше 100 строк за раз")
    .optional(),
  events: z
    .array(
      z.object({
        type: z
          .string()
          .min(1, "Тип события обязателен")
          .max(50, "Тип события — до 50 символов"),
        data: z.unknown().optional(),
      }),
    )
    .max(WORKER_HEARTBEAT_MAX_EVENTS, "Не больше 100 событий за раз")
    .optional(),
});

export const CompleteJobSchema = z.object({
  attempt,
  result: z.unknown().optional(),
});

export const FailJobSchema = z.object({
  attempt,
  code: z
    .string()
    .min(1)
    .max(64, "code — до 64 символов")
    .regex(/^[A-Z0-9_]+$/, "code — ЗАГЛАВНЫЕ_БУКВЫ, цифры и _"),
  message: z.string().min(1).max(2_000, "message — до 2000 символов"),
  retryable: z.boolean().optional(),
});
