import { z } from "zod";

import {
  NODE_DESCRIPTION_MAX,
  NODE_HOST_MAX,
  NODE_NAME_MAX,
} from "../node.types";

const name = z
  .string()
  .trim()
  .min(1, "Название не может быть пустым")
  .max(NODE_NAME_MAX, `Название — не длиннее ${NODE_NAME_MAX} символов`);

const description = z
  .string()
  .trim()
  .max(
    NODE_DESCRIPTION_MAX,
    `Описание — не длиннее ${NODE_DESCRIPTION_MAX} символов`,
  )
  .nullable();

/** Имя хоста или IPv4/IPv6: без пробелов, кавычек и схемы. */
const HOST_RE = /^[A-Za-z0-9.:_-]+$/;

export const nodeHost = z
  .string()
  .trim()
  .min(1, "Адрес не может быть пустым")
  .max(NODE_HOST_MAX, `Адрес — не длиннее ${NODE_HOST_MAX} символов`)
  .regex(HOST_RE, "Адрес — имя хоста или IP, без схемы и пробелов");

const serverUrl = z
  .url("Ожидается адрес сервера (http или https)")
  .max(500)
  .refine(url => /^https?:\/\//.test(url), "Адрес — http или https");

const pageQuery = {
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

/** Флаг «только свои» строкой query: в boolean его переводит генератор маршрутов. */
const mine = z.enum(["true", "false"], "mine — true или false").optional();

export const NodesQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  mine,
  ...pageQuery,
});

export const NodeOptionsQuerySchema = z.object({ mine });

export const CreateNodeSchema = z.object({
  name,
  description: description.optional(),
  host: nodeHost.nullable().optional(),
  ownerId: z.uuid("Ожидается id пользователя").nullable().optional(),
});

export const UpdateNodeSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    host: nodeHost.nullable().optional(),
  })
  .refine(body => Object.values(body).some(v => v !== undefined), {
    message: "Нужно хотя бы одно поле",
  });

export const AssignNodeSchema = z.object({
  userId: z.uuid("Ожидается id пользователя"),
});

export const CreateNodeInstallCommandSchema = z.object({
  baseUrl: serverUrl.optional(),
  expiresInMinutes: z
    .number()
    .int()
    .min(5)
    .max(30 * 24 * 60)
    .optional(),
});

const ssh = {
  host: nodeHost.optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z
    .string()
    .trim()
    .regex(/^[a-z_][a-z0-9_.-]{0,31}$/i, "Некорректное имя пользователя SSH")
    .optional(),
  password: z.string().min(1).max(256).optional(),
  privateKey: z.string().min(1).max(16_000).optional(),
  passphrase: z.string().min(1).max(256).optional(),
  sudo: z.boolean().optional(),
  backendUrl: serverUrl.optional(),
};

const requireSecret = {
  message: "Нужен пароль или приватный ключ SSH",
  path: ["password"],
};

export const InstallNodeAgentSchema = z
  .object(ssh)
  .refine(body => Boolean(body.password || body.privateKey), requireSecret);

export const UninstallNodeAgentSchema = z
  .object({ ...ssh, purge: z.boolean().optional() })
  .refine(body => Boolean(body.password || body.privateKey), requireSecret);
