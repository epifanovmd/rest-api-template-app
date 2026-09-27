import { definePermissions } from "../permission";

/** Права модуля сообщений; по умолчанию — только у admin (через `*`). */
export const MessagePermissions = definePermissions("message", {
  VIEW: "message:view",
  MANAGE: "message:manage",
  ALL: "message:*",
});
