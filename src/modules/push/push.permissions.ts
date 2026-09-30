import { definePermissions } from "../permission";

/** Права модуля push-уведомлений. */
export const PushPermissions = definePermissions(
  "push",
  { key: "push", label: "Push-уведомления" },
  {
    MANAGE: { name: "push:manage", label: "Управление push-уведомлениями" },
  },
);
