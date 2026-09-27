import { definePermissions } from "../permission";

/** Права модуля чатов; по умолчанию — только у admin (через `*`). */
export const ChatPermissions = definePermissions("chat", {
  VIEW: "chat:view",
  MANAGE: "chat:manage",
  ALL: "chat:*",
});
