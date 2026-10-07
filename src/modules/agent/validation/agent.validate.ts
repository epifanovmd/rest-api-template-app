import { z } from "zod";

import { PAGINATION_MAX_LIMIT } from "../../../core";
import { AGENT_COMMAND_MAX_TIMEOUT_SEC, EAgentStatus } from "../agent.types";

const pagination = {
  limit: z.coerce
    .number()
    .int("limit должен быть целым числом")
    .min(1, "limit должен быть не меньше 1")
    .max(
      PAGINATION_MAX_LIMIT,
      `limit не должен превышать ${PAGINATION_MAX_LIMIT}`,
    )
    .optional(),
  offset: z.coerce
    .number()
    .int("offset должен быть целым числом")
    .min(0, "offset не может быть отрицательным")
    .optional(),
};

const labels = z
  .record(
    z
      .string()
      .min(1)
      .max(50, "Ключ метки не длиннее 50 символов")
      .regex(/^[a-z0-9][a-z0-9._-]*$/i, "Ключ метки: буквы, цифры, . _ -"),
    z.string().max(200, "Значение метки не длиннее 200 символов"),
  )
  .refine(value => Object.keys(value).length <= 20, "Не больше 20 меток");

export const PageQuerySchema = z.object(pagination);

export const ListAgentsQuerySchema = z.object({
  ...pagination,
  status: z.enum(EAgentStatus).optional(),
});

export const CreateEnrollmentTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Название обязательно")
    .max(100, "Название не должно превышать 100 символов"),
  labels: labels.optional(),
  maxUses: z
    .number()
    .int("maxUses — целое число")
    .min(1, "maxUses не меньше 1")
    .max(100_000, "maxUses не больше 100000")
    .optional(),
  ephemeral: z.boolean().optional(),
  expiresAt: z.coerce
    .date({ message: "Некорректная дата" })
    .refine(date => date.getTime() > Date.now(), "Дата должна быть в будущем")
    .optional(),
});

export const EnrollAgentSchema = z.object({
  token: z.string().min(1, "Токен обязателен").max(128, "Токен не наш"),
  name: z
    .string()
    .trim()
    .min(1, "Имя агента обязательно")
    .max(200, "Имя агента не длиннее 200 символов"),
  labels: labels.optional(),
  host: z
    .object({
      hostname: z.string().max(255).optional(),
      os: z.string().max(50).optional(),
      arch: z.string().max(50).optional(),
    })
    .optional(),
});

export const CreateAgentCommandSchema = z.object({
  name: z
    .string()
    .min(1, "Имя команды обязательно")
    .max(100, "Имя команды не длиннее 100 символов"),
  args: z.unknown().optional(),
  timeoutSec: z
    .number()
    .int("timeoutSec — целое число")
    .min(1, "timeoutSec не меньше 1")
    .max(
      AGENT_COMMAND_MAX_TIMEOUT_SEC,
      `timeoutSec не больше ${AGENT_COMMAND_MAX_TIMEOUT_SEC}`,
    )
    .optional(),
});

const envelope = z.object({
  type: z.string().min(1).max(50),
  id: z.string().max(64).optional(),
  re: z.string().max(64).optional(),
  seq: z.number().int().min(1).optional(),
  ts: z.number().int().optional(),
  data: z.unknown().optional(),
});

export const AgentSyncSchema = z.object({
  sessionId: z.uuid("sessionId — UUID").nullable().optional(),
  messages: z.array(envelope).max(5000, "Не больше 5000 сообщений за обмен"),
  waitSeconds: z.number().int().min(0).max(25).optional(),
});

export const UpdateAgentSchema = z.object({
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/, "Версия — semver")
    .optional(),
});
