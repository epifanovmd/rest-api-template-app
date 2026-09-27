import { z } from "zod";

import { defineModuleConfig, positiveInt } from "../../config";

export const workspaceConfig = defineModuleConfig(
  "workspace",
  z.object({
    /** Страница принятия приглашения на фронтенде; `{{token}}` — токен. */
    inviteWebUrl: z
      .string()
      .default("http://localhost:3000/workspaces/invite?token={{token}}"),
    /** Срок приглашения, часов. */
    inviteTtlHours: positiveInt.default(168),
  }),
  {
    inviteWebUrl: process.env.WEB_URL_WORKSPACE_INVITE,
    inviteTtlHours: process.env.WORKSPACE_INVITE_TTL_HOURS,
  },
);
