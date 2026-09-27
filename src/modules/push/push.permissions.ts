import { definePermissions } from "../permission";

/** Права модуля push-уведомлений. */
export const PushPermissions = definePermissions("push", {
  MANAGE: "push:manage",
});
