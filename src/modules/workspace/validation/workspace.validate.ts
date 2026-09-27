import { z } from "zod";

import {
  ASSIGNABLE_WORKSPACE_ROLES,
  WORKSPACE_DESCRIPTION_MAX,
  WORKSPACE_INVITE_EMAIL_MAX,
  WORKSPACE_NAME_MAX,
  WORKSPACE_SLUG_MAX,
  WORKSPACE_SLUG_MIN,
  WORKSPACE_SLUG_RE,
} from "../workspace.types";

const name = z
  .string()
  .trim()
  .min(1, "Название не может быть пустым")
  .max(
    WORKSPACE_NAME_MAX,
    `Название не должно превышать ${WORKSPACE_NAME_MAX} символов`,
  );

const description = z
  .string()
  .trim()
  .max(
    WORKSPACE_DESCRIPTION_MAX,
    `Описание не должно превышать ${WORKSPACE_DESCRIPTION_MAX} символов`,
  );

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(WORKSPACE_SLUG_MIN, `Адрес — минимум ${WORKSPACE_SLUG_MIN} символа`)
  .max(
    WORKSPACE_SLUG_MAX,
    `Адрес не должен превышать ${WORKSPACE_SLUG_MAX} символов`,
  )
  .regex(
    WORKSPACE_SLUG_RE,
    "Адрес — латиница, цифры и дефис, без дефиса по краям",
  );

const assignableRole = z.enum(ASSIGNABLE_WORKSPACE_ROLES, {
  message: `Роль — одна из: ${ASSIGNABLE_WORKSPACE_ROLES.join(", ")}`,
});

export const CreateWorkspaceSchema = z.object({
  name,
  slug: slug.optional(),
  description: description.optional(),
});

export const UpdateWorkspaceSchema = z
  .object({
    name: name.optional(),
    slug: slug.optional(),
    description: description.optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    body =>
      body.name !== undefined ||
      body.slug !== undefined ||
      body.description !== undefined ||
      body.archived !== undefined,
    { message: "Нечего изменять", path: ["_"] },
  );

export const ChangeWorkspaceMemberRoleSchema = z.object({
  role: assignableRole,
});

export const TransferWorkspaceOwnershipSchema = z.object({
  userId: z.uuid("Некорректный идентификатор пользователя"),
});

export const CreateWorkspaceInviteSchema = z.object({
  email: z
    .email("Неверный формат email")
    .max(
      WORKSPACE_INVITE_EMAIL_MAX,
      `Email не должен превышать ${WORKSPACE_INVITE_EMAIL_MAX} символов`,
    )
    .transform(value => value.trim().toLowerCase()),
  role: assignableRole,
});

export const AcceptWorkspaceInviteSchema = z.object({
  token: z.string().min(1, "Токен обязателен").max(200, "Некорректный токен"),
});
